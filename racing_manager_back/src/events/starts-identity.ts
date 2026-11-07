import {
  normalizeStartDisplayName,
  normalizeStartLabelForComparison,
  resolveStartLabel,
  type StartNamingConfig,
} from './starts-label';

export interface StartIdentityConfig extends StartNamingConfig {
  formatIds: readonly number[];
}

export interface StartLabelCollision {
  normalizedLabel: string;
  indexes: number[];
  labels: string[];
}

export function normalizeStartFormatIds(
  formatIds: readonly number[],
): number[] {
  return [...new Set(formatIds)].sort((left, right) => left - right);
}

export function buildStartIdentity(start: StartIdentityConfig): string {
  return JSON.stringify([
    start.purposeType,
    start.lapCount,
    start.lapLengthMeters,
    normalizeStartFormatIds(start.formatIds),
    normalizeStartDisplayName(start.displayName)?.toLowerCase() ?? null,
  ]);
}

export function areStartsIdentical(
  left: StartIdentityConfig,
  right: StartIdentityConfig,
): boolean {
  return buildStartIdentity(left) === buildStartIdentity(right);
}

export function findStartLabelCollisions(
  starts: readonly StartNamingConfig[],
): StartLabelCollision[] {
  const groups = new Map<string, { labels: Set<string>; indexes: number[] }>();

  starts.forEach((start, index) => {
    const label = resolveStartLabel(start);
    const key = normalizeStartLabelForComparison(label);
    const group = groups.get(key) ?? { labels: new Set<string>(), indexes: [] };
    group.labels.add(label);
    group.indexes.push(index);
    groups.set(key, group);
  });

  return [...groups.entries()]
    .filter(([, group]) => group.indexes.length > 1)
    .map(([normalizedLabel, group]) => ({
      normalizedLabel,
      indexes: group.indexes,
      labels: [...group.labels],
    }));
}
