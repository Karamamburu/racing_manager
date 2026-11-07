import type {
  EnrollmentInputRequest,
  StartResponse,
} from '../../shared/types/event';

export type EnrollmentSelection = {
  startId: string;
  formatId: number;
};

export function initialEnrollments(
  starts: StartResponse[],
  initialFormatId?: number,
): EnrollmentSelection[] {
  if (starts.length === 0) return [];
  const preferredStart =
    initialFormatId != null
      ? starts.find((start) => start.formatIds.includes(initialFormatId))
      : undefined;
  const start = preferredStart ?? starts[0];
  const formatId =
    initialFormatId != null && start.formatIds.includes(initialFormatId)
      ? initialFormatId
      : start.formatIds[0];
  return formatId == null ? [] : [{ startId: start.id, formatId }];
}

export function toggleEnrollmentStart(
  starts: StartResponse[],
  selections: EnrollmentSelection[],
  startId: string,
  checked: boolean,
): EnrollmentSelection[] {
  if (!checked) {
    return selections.filter((row) => row.startId !== startId);
  }
  if (selections.some((row) => row.startId === startId)) {
    return selections;
  }
  const start = starts.find((row) => row.id === startId);
  const formatId = start?.formatIds[0];
  return formatId == null
    ? selections
    : [...selections, { startId, formatId }];
}

export function setEnrollmentFormat(
  selections: EnrollmentSelection[],
  startId: string,
  formatId: number,
): EnrollmentSelection[] {
  return selections.map((row) =>
    row.startId === startId ? { ...row, formatId } : row,
  );
}

export function buildEnrollments(
  selections: EnrollmentSelection[],
): EnrollmentInputRequest[] {
  return selections.map((row) => ({
    startId: row.startId,
    formatId: row.formatId,
  }));
}
