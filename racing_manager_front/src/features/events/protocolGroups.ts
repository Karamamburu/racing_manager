import type {
  CategoryFinishRef,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';

export type ClassificationSection = {
  key: string;
  title: string;
  rows: EventParticipant[];
};

export type GenderGroup = {
  key: string;
  title: string;
  sections: ClassificationSection[];
};

const GENDER_ORDER = ['M', 'F'] as const;

const genderGroupLabels: Record<string, string> = {
  M: 'Мужчины',
  F: 'Женщины',
};

const UNPLACED_STATUSES = new Set([
  'DNS',
  'DNF',
  'DSQ',
  'NQ',
  'CANCELLED',
  'WITHDRAWN',
]);

function sortedFormats(formats: EventFormatRef[]): EventFormatRef[] {
  return [...formats].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
  );
}

function participantFormats(
  participants: EventParticipant[],
  formats: EventFormatRef[],
  startId: string,
): EventFormatRef[] {
  const byId = new Map(formats.map((format) => [format.id, format]));
  const found = new Map<number, EventFormatRef>();
  for (const participant of participants) {
    if (participant.startId !== startId || !participant.format) continue;
    if (!found.has(participant.format.id)) {
      found.set(participant.format.id, byId.get(participant.format.id) ?? participant.format);
    }
  }
  return [...found.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
  );
}

/**
 * Protocol partition: gender → start `sortOrder` → participation format.
 * With no starts (legacy response) it falls back to gender → format.
 */
export function groupParticipants(
  participants: EventParticipant[],
  formats: EventFormatRef[],
  starts: StartResponse[],
): GenderGroup[] {
  const orderedFormats = sortedFormats(formats);
  const orderedStarts = [...starts].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
  const groups: GenderGroup[] = [];

  for (const gender of GENDER_ORDER) {
    const sections: ClassificationSection[] = [];
    if (orderedStarts.length === 0) {
      if (orderedFormats.length === 0) {
        const rows = participants.filter(
          (participant) => participant.gender === gender,
        );
        if (rows.length) {
          sections.push({ key: gender, title: 'Участники', rows });
        }
      } else {
        for (const format of orderedFormats) {
          const rows = participants.filter(
            (participant) =>
              participant.format?.id === format.id &&
              participant.gender === gender,
          );
          if (rows.length) {
            sections.push({
              key: `${format.id}-${gender}`,
              title: format.name,
              rows,
            });
          }
        }
      }
    } else {
      for (const start of orderedStarts) {
        const formatsForStart = participantFormats(
          participants,
          orderedFormats,
          start.id,
        );
        for (const format of formatsForStart) {
          const rows = participants.filter(
            (participant) =>
              participant.startId === start.id &&
              participant.format?.id === format.id &&
              participant.gender === gender,
          );
          if (rows.length) {
            sections.push({
              key: `${start.id}-${format.id}-${gender}`,
              title: `${start.resolvedLabel} · ${format.name}`,
              rows,
            });
          }
        }
      }
    }
    if (sections.length) {
      groups.push({
        key: gender,
        title: genderGroupLabels[gender] ?? gender,
        sections,
      });
    }
  }
  return groups;
}

export function categoryHasResults(rows: EventParticipant[]): boolean {
  return rows.some((row) => row.outcome != null || row.finishTimeMs != null);
}

export function categoryReadyToFinish(rows: EventParticipant[]): boolean {
  return rows
    .filter((row) => !UNPLACED_STATUSES.has(row.status))
    .every((row) => row.outcome != null || row.finishTimeMs != null);
}

export function categoryIsFinished(
  finishes: CategoryFinishRef[],
  startId: string | null,
  formatId: number | null,
  gender: string,
): boolean {
  return finishes.some(
    (item) =>
      item.startId === startId &&
      item.formatId === formatId &&
      item.gender === gender,
  );
}
