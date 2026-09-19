import { DomainError, ErrorCodes } from './errors';
import {
  Advancement,
  AdvancementCut,
  CompetitionFormat,
  HeatLayout,
  RankingRule,
  SeedingRule,
  STAGE_KINDS,
  StageKind,
  StageSpec,
} from './types';

function isStageKind(value: string): value is StageKind {
  return (STAGE_KINDS as readonly string[]).includes(value);
}

function validateSeedingRule(seeding: SeedingRule, path: string): void {
  const types = ['BY_OVERALL_RANK', 'SNAKE', 'CROSS', 'MANUAL'] as const;
  if (!types.includes(seeding.type)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Unknown seeding type "${String((seeding as { type: string }).type)}".`,
      `${path}.type`,
    );
  }
}

function validateHeatLayout(heats: HeatLayout, path: string): void {
  if (heats.type === 'NONE') {
    return;
  }
  if (heats.type !== 'HEATS') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'heats.type must be NONE or HEATS.',
      `${path}.type`,
    );
  }
  if (heats.remainder !== 'BALANCED') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'heats.remainder must be BALANCED.',
      `${path}.remainder`,
    );
  }
  if (heats.heatCount == null && heats.heatSize == null) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'HEATS layout requires heatCount and/or heatSize.',
      path,
    );
  }
  if (heats.heatCount != null && (!Number.isInteger(heats.heatCount) || heats.heatCount < 1)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'heatCount must be an integer >= 1.',
      `${path}.heatCount`,
    );
  }
  if (heats.heatSize != null && (!Number.isInteger(heats.heatSize) || heats.heatSize < 1)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'heatSize must be an integer >= 1.',
      `${path}.heatSize`,
    );
  }
  validateSeedingRule(heats.seeding, `${path}.seeding`);
}

function validateRankingRule(ranking: RankingRule, path: string): void {
  if (ranking.type !== 'BY_PLACE') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'ranking.type must be BY_PLACE.',
      `${path}.type`,
    );
  }
}

function validateCut(cut: AdvancementCut, path: string): void {
  switch (cut.type) {
    case 'TOP_PERCENT':
      if (typeof cut.percent !== 'number' || !Number.isFinite(cut.percent)) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_PERCENT.percent must be a number.',
          `${path}.percent`,
        );
      }
      if (cut.percent <= 0 || cut.percent > 100) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_PERCENT.percent must be in (0, 100].',
          `${path}.percent`,
        );
      }
      return;
    case 'TOP_FRACTION':
      if (!Number.isInteger(cut.numerator) || cut.numerator < 1) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_FRACTION.numerator must be an integer >= 1.',
          `${path}.numerator`,
        );
      }
      if (!Number.isInteger(cut.denominator) || cut.denominator < 1) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_FRACTION.denominator must be an integer >= 1.',
          `${path}.denominator`,
        );
      }
      if (cut.numerator > cut.denominator) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_FRACTION.numerator must be <= denominator.',
          `${path}.numerator`,
        );
      }
      return;
    case 'TOP_N':
      if (!Number.isInteger(cut.n) || cut.n < 1) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_N.n must be an integer >= 1.',
          `${path}.n`,
        );
      }
      return;
    case 'RANK_RANGE':
      if (!Number.isInteger(cut.from) || cut.from < 1) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'RANK_RANGE.from must be an integer >= 1.',
          `${path}.from`,
        );
      }
      if (!Number.isInteger(cut.to) || cut.to < cut.from) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'RANK_RANGE.to must be an integer >= from.',
          `${path}.to`,
        );
      }
      return;
    case 'TOP_PER_HEAT':
      if (!Number.isInteger(cut.n) || cut.n < 1) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'TOP_PER_HEAT.n must be an integer >= 1.',
          `${path}.n`,
        );
      }
      return;
    case 'FIRST_HALF':
    case 'SECOND_HALF':
      return;
    default:
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        `Unknown advancement cut type "${String((cut as { type: string }).type)}".`,
        `${path}.type`,
      );
  }
}

function validateAdvancement(advancement: Advancement, path: string): void {
  if (advancement.type === 'NONE') {
    return;
  }
  if (advancement.type !== 'ROUTES') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'advancement.type must be NONE or ROUTES.',
      `${path}.type`,
    );
  }
  if (!Array.isArray(advancement.routes) || advancement.routes.length === 0) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'ROUTES advancement requires at least one route.',
      `${path}.routes`,
    );
  }
  for (let index = 0; index < advancement.routes.length; index += 1) {
    const route = advancement.routes[index];
    const routePath = `${path}.routes[${index}]`;
    if (!route.toStageId || typeof route.toStageId !== 'string') {
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        'Route toStageId must be a non-empty string.',
        `${routePath}.toStageId`,
      );
    }
    validateCut(route.cut, `${routePath}.cut`);
  }
}

function validateStage(stage: StageSpec, path: string): void {
  if (!stage.id || typeof stage.id !== 'string' || !stage.id.trim()) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Stage id must be a non-empty string.',
      `${path}.id`,
    );
  }
  if (!isStageKind(stage.kind)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Unknown stage kind "${String(stage.kind)}".`,
      `${path}.kind`,
    );
  }
  validateHeatLayout(stage.heats, `${path}.heats`);
  validateRankingRule(stage.ranking, `${path}.ranking`);
  validateAdvancement(stage.advancement, `${path}.advancement`);
}

function detectCycles(stageIds: string[], edges: Array<[string, string]>): void {
  const outgoing = new Map<string, string[]>();
  for (const id of stageIds) {
    outgoing.set(id, []);
  }
  for (const [from, to] of edges) {
    outgoing.get(from)?.push(to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of stageIds) {
    color.set(id, WHITE);
  }

  const visit = (id: string, stack: string[]): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const nextColor = color.get(next);
      if (nextColor === GRAY) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          `Stage graph contains a cycle: ${[...stack, next].join(' -> ')}.`,
          'format.stages',
        );
      }
      if (nextColor === WHITE) {
        visit(next, stack);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of stageIds) {
    if (color.get(id) === WHITE) {
      visit(id, []);
    }
  }
}

export function findStage(
  format: CompetitionFormat,
  stageId: string,
  path = 'stageId',
): StageSpec {
  const stage = format.stages.find((item) => item.id === stageId);
  if (!stage) {
    throw new DomainError(
      ErrorCodes.STAGE_NOT_FOUND,
      `Stage "${stageId}" is not in the format.`,
      path,
    );
  }
  return stage;
}

export function validateFormat(format: CompetitionFormat, path = 'format'): void {
  if (!format.stages || format.stages.length === 0) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Format must contain at least one stage.',
      `${path}.stages`,
    );
  }

  const ids = new Set<string>();
  for (let index = 0; index < format.stages.length; index += 1) {
    const stage = format.stages[index];
    const stagePath = `${path}.stages[${index}]`;
    validateStage(stage, stagePath);
    if (ids.has(stage.id)) {
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        `Duplicate stage id "${stage.id}".`,
        `${stagePath}.id`,
      );
    }
    ids.add(stage.id);
  }

  const edges: Array<[string, string]> = [];
  for (let index = 0; index < format.stages.length; index += 1) {
    const stage = format.stages[index];
    if (stage.advancement.type !== 'ROUTES') {
      continue;
    }
    for (let routeIndex = 0; routeIndex < stage.advancement.routes.length; routeIndex += 1) {
      const route = stage.advancement.routes[routeIndex];
      const routePath = `${path}.stages[${index}].advancement.routes[${routeIndex}]`;
      if (!ids.has(route.toStageId)) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          `Route targets unknown stage "${route.toStageId}".`,
          `${routePath}.toStageId`,
        );
      }
      if (route.toStageId === stage.id) {
        throw new DomainError(
          ErrorCodes.FORMAT_INVALID,
          'Stage cannot advance to itself.',
          `${routePath}.toStageId`,
        );
      }
      edges.push([stage.id, route.toStageId]);
    }
  }

  detectCycles([...ids], edges);
}
