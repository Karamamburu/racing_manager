import { DomainError } from '../../src/domain/errors';
import { CompetitionFormat } from '../../src/domain/types';
import { validateFormat } from '../../src/domain/validate-format';
import { knockout24Format } from '../../src/presets';

const terminal = {
  heats: { type: 'NONE' as const },
  ranking: { type: 'BY_PLACE' as const },
  advancement: { type: 'NONE' as const },
};

describe('validateFormat', () => {
  it('accepts the knockout-24 preset', () => {
    expect(() => validateFormat(knockout24Format)).not.toThrow();
  });

  it('rejects an empty stage list', () => {
    expect(() => validateFormat({ stages: [] })).toThrow(DomainError);
  });

  it('rejects an unknown toStageId', () => {
    const format: CompetitionFormat = {
      stages: [
        {
          id: 'prologue',
          kind: 'PROLOGUE',
          heats: { type: 'NONE' },
          ranking: { type: 'BY_PLACE' },
          advancement: {
            type: 'ROUTES',
            routes: [{ cut: { type: 'TOP_N', n: 10 }, toStageId: 'missing' }],
          },
        },
      ],
    };
    expect(() => validateFormat(format)).toThrow(/unknown stage "missing"/);
  });

  it('rejects a cyclic stage graph', () => {
    const format: CompetitionFormat = {
      stages: [
        {
          id: 'a',
          kind: 'CUSTOM',
          heats: { type: 'NONE' },
          ranking: { type: 'BY_PLACE' },
          advancement: {
            type: 'ROUTES',
            routes: [{ cut: { type: 'TOP_N', n: 1 }, toStageId: 'b' }],
          },
        },
        {
          id: 'b',
          kind: 'CUSTOM',
          ...terminal,
          advancement: {
            type: 'ROUTES',
            routes: [{ cut: { type: 'TOP_N', n: 1 }, toStageId: 'a' }],
          },
        },
      ],
    };
    expect(() => validateFormat(format)).toThrow(/cycle/);
  });

  it('rejects duplicate stage ids', () => {
    const format: CompetitionFormat = {
      stages: [
        { id: 'a', kind: 'CUSTOM', ...terminal },
        { id: 'a', kind: 'FINAL', ...terminal },
      ],
    };
    expect(() => validateFormat(format)).toThrow(/Duplicate stage id/);
  });
});
