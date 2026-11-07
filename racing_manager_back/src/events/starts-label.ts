import type { StartPurposeType } from '../../generated/prisma';
import {
  displayedDistanceMeters,
  formatStartDistanceKm,
  type StartDistanceConfig,
} from './starts-distance';

export const START_PURPOSE_LABELS: Record<StartPurposeType, string> = {
  CUP_RACE: 'Кубковая гонка',
  CONTROL_TRAINING: 'Контрольная тренировка',
};

export interface StartNamingConfig extends StartDistanceConfig {
  purposeType: StartPurposeType;
  displayName?: string | null;
}

export function normalizeStartDisplayName(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildAutoStartLabel(start: StartNamingConfig): string {
  return `${START_PURPOSE_LABELS[start.purposeType]} — ${formatStartDistanceKm(
    displayedDistanceMeters(start),
  )} км`;
}

export function resolveStartLabel(start: StartNamingConfig): string {
  return (
    normalizeStartDisplayName(start.displayName) ?? buildAutoStartLabel(start)
  );
}

export function normalizeStartLabelForComparison(label: string): string {
  return label.trim().toLowerCase();
}
