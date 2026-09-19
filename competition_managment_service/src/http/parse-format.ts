import { DomainError, ErrorCodes } from '../domain/errors';
import {
  Advancement,
  AdvancementCut,
  AdvancementRoute,
  CompetitionFormat,
  HeatLayout,
  RankingRule,
  RESULT_STATUSES,
  ResultStatus,
  SeedingRule,
  STAGE_KINDS,
  StageKind,
  StageSpec,
} from '../domain/types';
import { readArray, readInteger, readNumber, readObject, readString } from './parse-helpers';

function parseStageKind(value: unknown, path: string): StageKind {
  const kind = readString(value, path);
  if (!kind || !(STAGE_KINDS as readonly string[]).includes(kind)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `${path} must be one of: ${STAGE_KINDS.join(', ')}.`,
      path,
    );
  }
  return kind as StageKind;
}

function parseSeedingRule(value: unknown, path: string): SeedingRule {
  const raw = readObject(value, path);
  const type = readString(raw.type, `${path}.type`);
  if (
    type === 'BY_OVERALL_RANK' ||
    type === 'SNAKE' ||
    type === 'CROSS' ||
    type === 'MANUAL'
  ) {
    return { type };
  }
  throw new DomainError(
    ErrorCodes.FORMAT_INVALID,
    `${path}.type must be BY_OVERALL_RANK, SNAKE, CROSS, or MANUAL.`,
    `${path}.type`,
  );
}

function parseHeatLayout(value: unknown, path: string): HeatLayout {
  const raw = readObject(value, path);
  const type = readString(raw.type, `${path}.type`);
  if (type === 'NONE') {
    return { type: 'NONE' };
  }
  if (type !== 'HEATS') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `${path}.type must be NONE or HEATS.`,
      `${path}.type`,
    );
  }
  const remainder = readString(raw.remainder, `${path}.remainder`);
  if (remainder !== 'BALANCED') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `${path}.remainder must be BALANCED.`,
      `${path}.remainder`,
    );
  }
  return {
    type: 'HEATS',
    heatCount: readInteger(raw.heatCount, `${path}.heatCount`, false),
    heatSize: readInteger(raw.heatSize, `${path}.heatSize`, false),
    remainder: 'BALANCED',
    seeding: parseSeedingRule(raw.seeding, `${path}.seeding`),
  };
}

function parseRankingRule(value: unknown, path: string): RankingRule {
  const raw = readObject(value, path);
  const type = readString(raw.type, `${path}.type`);
  if (type === 'BY_TIME' || type === 'BY_HEAT_PLACE_THEN_TIME') {
    return { type };
  }
  throw new DomainError(
    ErrorCodes.FORMAT_INVALID,
    `${path}.type must be BY_TIME or BY_HEAT_PLACE_THEN_TIME.`,
    `${path}.type`,
  );
}

function parseCut(value: unknown, path: string): AdvancementCut {
  const raw = readObject(value, path);
  const type = readString(raw.type, `${path}.type`);
  switch (type) {
    case 'TOP_PERCENT':
      return {
        type: 'TOP_PERCENT',
        percent: readNumber(raw.percent, `${path}.percent`) as number,
      };
    case 'TOP_FRACTION':
      return {
        type: 'TOP_FRACTION',
        numerator: readInteger(raw.numerator, `${path}.numerator`) as number,
        denominator: readInteger(raw.denominator, `${path}.denominator`) as number,
      };
    case 'TOP_N':
      return { type: 'TOP_N', n: readInteger(raw.n, `${path}.n`) as number };
    case 'RANK_RANGE':
      return {
        type: 'RANK_RANGE',
        from: readInteger(raw.from, `${path}.from`) as number,
        to: readInteger(raw.to, `${path}.to`) as number,
      };
    case 'TOP_PER_HEAT':
      return { type: 'TOP_PER_HEAT', n: readInteger(raw.n, `${path}.n`) as number };
    default:
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        `${path}.type is not a supported advancement cut.`,
        `${path}.type`,
      );
  }
}

function parseAdvancement(value: unknown, path: string): Advancement {
  const raw = readObject(value, path);
  const type = readString(raw.type, `${path}.type`);
  if (type === 'NONE') {
    return { type: 'NONE' };
  }
  if (type !== 'ROUTES') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `${path}.type must be NONE or ROUTES.`,
      `${path}.type`,
    );
  }
  const routesRaw = readArray(raw.routes, `${path}.routes`);
  const routes: AdvancementRoute[] = routesRaw.map((item, index) => {
    const routePath = `${path}.routes[${index}]`;
    const route = readObject(item, routePath);
    return {
      cut: parseCut(route.cut, `${routePath}.cut`),
      toStageId: readString(route.toStageId, `${routePath}.toStageId`) as string,
    };
  });
  return { type: 'ROUTES', routes };
}

function parseStage(value: unknown, path: string): StageSpec {
  const raw = readObject(value, path);
  const stage: StageSpec = {
    id: readString(raw.id, `${path}.id`) as string,
    kind: parseStageKind(raw.kind, `${path}.kind`),
    heats: parseHeatLayout(raw.heats, `${path}.heats`),
    ranking: parseRankingRule(raw.ranking, `${path}.ranking`),
    advancement: parseAdvancement(raw.advancement, `${path}.advancement`),
  };
  const label = readString(raw.label, `${path}.label`, false);
  if (label) {
    stage.label = label;
  }
  return stage;
}

export function parseFormat(value: unknown, path = 'format'): CompetitionFormat {
  const raw = readObject(value, path);
  const stagesRaw = readArray(raw.stages, `${path}.stages`);
  return {
    stages: stagesRaw.map((item, index) => parseStage(item, `${path}.stages[${index}]`)),
  };
}

export function parseResultStatus(value: unknown, path: string): ResultStatus {
  const status = readString(value, path);
  if (!status || !(RESULT_STATUSES as readonly string[]).includes(status)) {
    throw new DomainError(
      ErrorCodes.RESULT_INVALID,
      `${path} must be one of: ${RESULT_STATUSES.join(', ')}.`,
      path,
    );
  }
  return status as ResultStatus;
}
