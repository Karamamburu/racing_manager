import type {
  AgeSplitRef,
  CategoryFinishRef,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';

export const REMAINDER_SECTION_TITLE = 'Остальные участники';

export const NO_BIRTH_YEAR_SECTION_TITLE = 'Возраст не указан';

const CATEGORY_SECTION_ID = 'CATEGORY';
const REMAINDER_SECTION_ID = 'REMAINDER';
const NO_BIRTH_YEAR_SECTION_ID = 'NO_BIRTH_YEAR';

export type AgeSectionView = {
  key: string;
  title: string | null;
  rows: EventParticipant[];
};

export type ClassificationSection = {
  key: string;
  title: string;
  rows: EventParticipant[];
  ageSections: AgeSectionView[];
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
 * Splits one category's rows into the stored age sections: configured sections
 * in payload order, then `REMAINDER`, then `NO_BIRTH_YEAR`. A category without
 * an effective split (unsplit, disabled or suppressed by a class competition)
 * stays one headerless `CATEGORY` section. Empty sections are dropped.
 */
export function buildAgeSections(
  rows: EventParticipant[],
  split?: AgeSplitRef,
): AgeSectionView[] {
  if (
    !split ||
    !split.enabled ||
    rows.every((row) => row.sectionId === CATEGORY_SECTION_ID)
  ) {
    return [{ key: CATEGORY_SECTION_ID, title: null, rows }];
  }

  const grouped = new Map<string, EventParticipant[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.sectionId);
    if (bucket) bucket.push(row);
    else grouped.set(row.sectionId, [row]);
  }

  const sections: AgeSectionView[] = [];
  const take = (id: string, title: string | null): void => {
    const bucket = grouped.get(id);
    grouped.delete(id);
    if (bucket && bucket.length > 0) {
      sections.push({ key: id, title, rows: bucket });
    }
  };

  for (const configured of split.sections) {
    take(configured.id, configured.title);
  }
  take(REMAINDER_SECTION_ID, REMAINDER_SECTION_TITLE);
  take(NO_BIRTH_YEAR_SECTION_ID, NO_BIRTH_YEAR_SECTION_TITLE);
  for (const [id, bucket] of grouped) {
    sections.push({ key: id, title: id, rows: bucket });
  }
  return sections;
}

/**
 * Protocol partition: gender → start `sortOrder` → participation format.
 * With no starts (legacy response) it falls back to gender → format and never
 * applies an age split.
 */
export function groupParticipants(
  participants: EventParticipant[],
  formats: EventFormatRef[],
  starts: StartResponse[],
  ageSplits: AgeSplitRef[] = [],
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
          sections.push({
            key: gender,
            title: 'Участники',
            rows,
            ageSections: buildAgeSections(rows),
          });
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
              ageSections: buildAgeSections(rows),
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
            const split = ageSplits.find(
              (item) =>
                item.startId === start.id &&
                item.formatId === format.id &&
                item.gender === gender,
            );
            sections.push({
              key: `${start.id}-${format.id}-${gender}`,
              title: `${start.resolvedLabel} · ${format.name}`,
              rows,
              ageSections: buildAgeSections(rows, split),
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
