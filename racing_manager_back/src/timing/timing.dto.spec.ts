import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AssignAnonymousSplitDto,
  BindPendingFinishDto,
  CancelAnonymousSplitDto,
  CancelPendingFinishDto,
  CancelTimingAttemptDto,
  CancelTimingPassDto,
  CaptureTimingPassDto,
  CompleteTimingAttemptDto,
  CorrectOfficialTimeDto,
  ForceCompleteTimingAttemptDto,
  ForceReleaseCaptureDto,
  OpenClockEpochDto,
  QuickUndoTimingPassDto,
  QuickUndoTimingSplitDto,
  RebindTimingPassDto,
  SetRefereeRoleDto,
  StartHeatAttemptDto,
  StartTimingAttemptDto,
  TakeCaptureDto,
  TransferCaptureDto,
} from './timing.dto';

const ISO = '2026-11-13T10:00:00.000Z';
const ATTEMPT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const CLASS_COMPETITION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const WORKSTATION = 'workstation-a';

/** Names of the properties the validator refused for one payload. */
async function refused<T extends object>(
  metatype: new () => T,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const instance = plainToInstance(metatype, payload);
  const errors = await validate(instance);
  return errors.map((error) => error.property);
}

function startAttempt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    startId: 'b0f4f7f0-7d2c-4c6b-9f0d-0a1b2c3d4e5f',
    formatId: 1,
    gender: 'M',
    workstationInstanceId: WORKSTATION,
    clientStartedAt: ISO,
    ...overrides,
  };
}

function capturePass(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    attemptId: ATTEMPT_ID,
    kind: 'NUMBER',
    startNumber: 42,
    clientCapturedAt: ISO,
    clientElapsedMs: 1234,
    clockEpochId: 'epoch-1',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    ...overrides,
  };
}

/** One `ANONYMOUS_SPLIT` capture: no participant identity at all. */
function anonymousCapture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return capturePass({
    kind: 'ANONYMOUS_SPLIT',
    attemptId: undefined,
    startNumber: undefined,
    ...overrides,
  });
}

function startHeatAttempt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    classCompetitionId: CLASS_COMPETITION_ID,
    stageId: 'stage-1',
    heatNumber: 1,
    workstationInstanceId: WORKSTATION,
    clientStartedAt: ISO,
    ...overrides,
  };
}

function assignSplit(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    startNumber: 42,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    ...overrides,
  };
}

describe('StartTimingAttemptDto', () => {
  it('accepts a minimal Start press', async () => {
    await expect(
      refused(StartTimingAttemptDto, startAttempt()),
    ).resolves.toEqual([]);
  });

  it.each([
    'startId',
    'formatId',
    'gender',
    'workstationInstanceId',
    'clientStartedAt',
  ])('refuses a payload without %s', async (field) => {
    const payload = startAttempt();
    delete payload[field];

    await expect(refused(StartTimingAttemptDto, payload)).resolves.toContain(
      field,
    );
  });

  it.each(['X', 'MALE', 'm'])('refuses gender %s', async (gender) => {
    await expect(
      refused(StartTimingAttemptDto, startAttempt({ gender })),
    ).resolves.toContain('gender');
  });

  it.each([0, -1, 1.5, '1'])('refuses formatId %p', async (formatId) => {
    await expect(
      refused(StartTimingAttemptDto, startAttempt({ formatId })),
    ).resolves.toContain('formatId');
  });

  it('refuses a client start that is not ISO-8601', async () => {
    await expect(
      refused(
        StartTimingAttemptDto,
        startAttempt({ clientStartedAt: '13.11.2026 10:00' }),
      ),
    ).resolves.toContain('clientStartedAt');
  });

  it('refuses a blank workstation id', async () => {
    await expect(
      refused(
        StartTimingAttemptDto,
        startAttempt({ workstationInstanceId: '' }),
      ),
    ).resolves.toContain('workstationInstanceId');
  });
});

describe('StartHeatAttemptDto', () => {
  it('accepts a minimal heat Start press', async () => {
    await expect(
      refused(StartHeatAttemptDto, startHeatAttempt()),
    ).resolves.toEqual([]);
  });

  it.each([
    'classCompetitionId',
    'stageId',
    'heatNumber',
    'workstationInstanceId',
    'clientStartedAt',
  ])('refuses a payload without %s', async (field) => {
    const payload = startHeatAttempt();
    delete payload[field];

    await expect(refused(StartHeatAttemptDto, payload)).resolves.toContain(
      field,
    );
  });

  it('refuses a race id that is not a UUID', async () => {
    await expect(
      refused(
        StartHeatAttemptDto,
        startHeatAttempt({ classCompetitionId: 'competition-1' }),
      ),
    ).resolves.toContain('classCompetitionId');
  });

  it.each([0, -1, 1.5, '1'])('refuses heatNumber %p', async (heatNumber) => {
    await expect(
      refused(StartHeatAttemptDto, startHeatAttempt({ heatNumber })),
    ).resolves.toContain('heatNumber');
  });

  it('refuses a blank stage id', async () => {
    await expect(
      refused(StartHeatAttemptDto, startHeatAttempt({ stageId: '' })),
    ).resolves.toContain('stageId');
  });

  it('refuses a client start that is not ISO-8601', async () => {
    await expect(
      refused(
        StartHeatAttemptDto,
        startHeatAttempt({ clientStartedAt: '13.11.2026 10:00' }),
      ),
    ).resolves.toContain('clientStartedAt');
  });
});

describe('CaptureTimingPassDto', () => {
  it('accepts a NUMBER pass', async () => {
    await expect(refused(CaptureTimingPassDto, capturePass())).resolves.toEqual(
      [],
    );
  });

  it('accepts a TILE pass', async () => {
    const payload = capturePass({
      kind: 'TILE',
      startNumber: undefined,
      enrollmentId: 'enrollment-1',
    });

    await expect(refused(CaptureTimingPassDto, payload)).resolves.toEqual([]);
  });

  it('accepts a PENDING_FINISH pass with neither identity', async () => {
    const payload = capturePass({
      kind: 'PENDING_FINISH',
      startNumber: undefined,
    });

    await expect(refused(CaptureTimingPassDto, payload)).resolves.toEqual([]);
  });

  it('refuses a NUMBER pass without a start number', async () => {
    await expect(
      refused(CaptureTimingPassDto, capturePass({ startNumber: undefined })),
    ).resolves.toContain('startNumber');
  });

  it('refuses a NUMBER pass that also carries an enrollment', async () => {
    await expect(
      refused(
        CaptureTimingPassDto,
        capturePass({ enrollmentId: 'enrollment-1' }),
      ),
    ).resolves.toContain('kind');
  });

  it('refuses a TILE pass without an enrollment', async () => {
    await expect(
      refused(
        CaptureTimingPassDto,
        capturePass({ kind: 'TILE', startNumber: undefined }),
      ),
    ).resolves.toContain('enrollmentId');
  });

  it('refuses a TILE pass that also carries a start number', async () => {
    await expect(
      refused(
        CaptureTimingPassDto,
        capturePass({ kind: 'TILE', enrollmentId: 'enrollment-1' }),
      ),
    ).resolves.toContain('kind');
  });

  it.each([{ startNumber: 42 }, { enrollmentId: 'enrollment-1' }])(
    'refuses a PENDING_FINISH pass carrying %p',
    async (identity) => {
      const payload = capturePass({
        kind: 'PENDING_FINISH',
        startNumber: undefined,
        ...identity,
      });

      await expect(refused(CaptureTimingPassDto, payload)).resolves.toContain(
        'kind',
      );
    },
  );

  it('refuses an unknown capture kind', async () => {
    await expect(
      refused(CaptureTimingPassDto, capturePass({ kind: 'MANUAL' })),
    ).resolves.toContain('kind');
  });

  it('refuses an attempt id that is not a UUID', async () => {
    await expect(
      refused(CaptureTimingPassDto, capturePass({ attemptId: 'attempt-1' })),
    ).resolves.toContain('attemptId');
  });
  it('accepts a block-free ANONYMOUS_SPLIT with no attempt id', async () => {
    const payload = capturePass({
      kind: 'ANONYMOUS_SPLIT',
      attemptId: undefined,
      startNumber: undefined,
    });

    await expect(refused(CaptureTimingPassDto, payload)).resolves.toEqual([]);
  });

  it('refuses a device sequence below 1', async () => {
    for (const deviceSequence of [0, -1, 2.5]) {
      await expect(
        refused(CaptureTimingPassDto, capturePass({ deviceSequence })),
      ).resolves.toContain('deviceSequence');
    }
  });

  it('refuses a negative raw elapsed value', async () => {
    await expect(
      refused(CaptureTimingPassDto, capturePass({ clientElapsedMs: -1 })),
    ).resolves.toContain('clientElapsedMs');
  });

  it('refuses a capture instant that is not ISO-8601', async () => {
    await expect(
      refused(
        CaptureTimingPassDto,
        capturePass({ clientCapturedAt: 'yesterday' }),
      ),
    ).resolves.toContain('clientCapturedAt');
  });

  it('accepts an ANONYMOUS_SPLIT capture with neither identity', async () => {
    await expect(
      refused(CaptureTimingPassDto, anonymousCapture()),
    ).resolves.toEqual([]);
  });

  it.each([{ startNumber: 42 }, { enrollmentId: 'enrollment-1' }])(
    'refuses an ANONYMOUS_SPLIT capture carrying %p',
    async (identity) => {
      await expect(
        refused(CaptureTimingPassDto, anonymousCapture(identity)),
      ).resolves.toContain('kind');
    },
  );

  it.each([
    'clockEpochId',
    'workstationInstanceId',
    'deviceSequence',
    'clientCapturedAt',
    'clientElapsedMs',
  ])('refuses an ANONYMOUS_SPLIT capture without %s', async (field) => {
    const payload = anonymousCapture();
    delete payload[field];

    await expect(refused(CaptureTimingPassDto, payload)).resolves.toContain(
      field,
    );
  });
});

describe('BindPendingFinishDto', () => {
  it('accepts a bind by start number', async () => {
    const payload = {
      pendingFinishId: 'pending-1',
      startNumber: 42,
      workstationInstanceId: WORKSTATION,
      deviceSequence: 1,
    };

    await expect(refused(BindPendingFinishDto, payload)).resolves.toEqual([]);
  });

  it('accepts a bind by enrollment', async () => {
    const payload = {
      pendingFinishId: 'pending-1',
      enrollmentId: 'enrollment-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence: 1,
    };

    await expect(refused(BindPendingFinishDto, payload)).resolves.toEqual([]);
  });

  it('refuses a bind that names both a number and an enrollment', async () => {
    const payload = {
      pendingFinishId: 'pending-1',
      startNumber: 42,
      enrollmentId: 'enrollment-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence: 1,
    };

    await expect(refused(BindPendingFinishDto, payload)).resolves.toContain(
      'pendingFinishId',
    );
  });

  it('refuses a bind that names neither a number nor an enrollment', async () => {
    const payload = {
      pendingFinishId: 'pending-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence: 1,
    };

    const errors = await refused(BindPendingFinishDto, payload);

    expect(errors).toContain('pendingFinishId');
    expect(errors).toContain('startNumber');
    expect(errors).toContain('enrollmentId');
  });

  it('refuses a device sequence below 1', async () => {
    const payload = {
      pendingFinishId: 'pending-1',
      startNumber: 42,
      workstationInstanceId: WORKSTATION,
      deviceSequence: 0,
    };

    await expect(refused(BindPendingFinishDto, payload)).resolves.toContain(
      'deviceSequence',
    );
  });
});

describe('AssignAnonymousSplitDto', () => {
  it('accepts an assignment by start number', async () => {
    await expect(
      refused(AssignAnonymousSplitDto, assignSplit()),
    ).resolves.toEqual([]);
  });

  it('accepts an assignment by enrollment', async () => {
    const payload = assignSplit({
      startNumber: undefined,
      enrollmentId: 'enrollment-1',
    });

    await expect(refused(AssignAnonymousSplitDto, payload)).resolves.toEqual(
      [],
    );
  });

  it('refuses an assignment that names both a number and an enrollment', async () => {
    await expect(
      refused(
        AssignAnonymousSplitDto,
        assignSplit({ enrollmentId: 'enrollment-1' }),
      ),
    ).resolves.toContain('workstationInstanceId');
  });

  it('refuses an assignment that names neither a number nor an enrollment', async () => {
    const errors = await refused(
      AssignAnonymousSplitDto,
      assignSplit({ startNumber: undefined }),
    );

    expect(errors).toContain('workstationInstanceId');
    expect(errors).toContain('startNumber');
    expect(errors).toContain('enrollmentId');
  });

  it.each([0, -1, 1.5, '42'])('refuses startNumber %p', async (startNumber) => {
    await expect(
      refused(AssignAnonymousSplitDto, assignSplit({ startNumber })),
    ).resolves.toContain('startNumber');
  });

  it('refuses a blank enrollment id', async () => {
    const payload = assignSplit({ startNumber: undefined, enrollmentId: '' });

    await expect(refused(AssignAnonymousSplitDto, payload)).resolves.toContain(
      'enrollmentId',
    );
  });

  it('refuses a blank workstation id', async () => {
    await expect(
      refused(
        AssignAnonymousSplitDto,
        assignSplit({ workstationInstanceId: '' }),
      ),
    ).resolves.toContain('workstationInstanceId');
  });

  it('refuses a device sequence below 1', async () => {
    await expect(
      refused(AssignAnonymousSplitDto, assignSplit({ deviceSequence: 0 })),
    ).resolves.toContain('deviceSequence');
  });
});

describe('reason-carrying DTOs', () => {
  const cases: Array<[string, new () => object, Record<string, unknown>]> = [
    ['CancelPendingFinishDto', CancelPendingFinishDto, {}],
    ['CancelAnonymousSplitDto', CancelAnonymousSplitDto, {}],
    ['CancelTimingPassDto', CancelTimingPassDto, {}],
    ['ForceCompleteTimingAttemptDto', ForceCompleteTimingAttemptDto, {}],
    ['CancelTimingAttemptDto', CancelTimingAttemptDto, {}],
    [
      'RebindTimingPassDto',
      RebindTimingPassDto,
      { targetEnrollmentId: 'enrollment-1' },
    ],
    [
      'ForceReleaseCaptureDto',
      ForceReleaseCaptureDto,
      { workstationInstanceId: WORKSTATION },
    ],
  ];

  it.each(cases)('%s accepts a filled reason', async (_, metatype, payload) => {
    await expect(
      refused(metatype, { ...payload, reason: 'Referee correction' }),
    ).resolves.toEqual([]);
  });

  it.each(cases)('%s refuses an empty reason', async (_, metatype, payload) => {
    await expect(
      refused(metatype, { ...payload, reason: '' }),
    ).resolves.toContain('reason');
  });

  it.each(cases)(
    '%s refuses a missing reason',
    async (_, metatype, payload) => {
      await expect(refused(metatype, payload)).resolves.toContain('reason');
    },
  );

  it('leaves trimming to the service, which refuses a blank reason', async () => {
    await expect(
      refused(CancelTimingPassDto, { reason: '   ' }),
    ).resolves.toEqual([]);
  });
});

describe('CorrectOfficialTimeDto', () => {
  const base = {
    targetType: 'START',
    targetId: 'attempt-1',
    officialAt: ISO,
    reason: 'Referee correction',
  };

  it('accepts a start correction', async () => {
    await expect(refused(CorrectOfficialTimeDto, base)).resolves.toEqual([]);
  });

  it('accepts a pass correction', async () => {
    await expect(
      refused(CorrectOfficialTimeDto, { ...base, targetType: 'PASS' }),
    ).resolves.toEqual([]);
  });

  it('refuses an unknown target type', async () => {
    await expect(
      refused(CorrectOfficialTimeDto, { ...base, targetType: 'LAP' }),
    ).resolves.toContain('targetType');
  });

  it('refuses an official instant that is not ISO-8601', async () => {
    await expect(
      refused(CorrectOfficialTimeDto, { ...base, officialAt: '10:00' }),
    ).resolves.toContain('officialAt');
  });
});

describe('sequence and lock DTOs', () => {
  it('accepts a quick undo of sequence 1', async () => {
    const payload = { workstationInstanceId: WORKSTATION, deviceSequence: 1 };

    await expect(refused(QuickUndoTimingPassDto, payload)).resolves.toEqual([]);
  });

  it('refuses a quick undo of sequence 0', async () => {
    const payload = { workstationInstanceId: WORKSTATION, deviceSequence: 0 };

    await expect(refused(QuickUndoTimingPassDto, payload)).resolves.toContain(
      'deviceSequence',
    );
  });

  it('accepts a completion that issued no sequence', async () => {
    const payload = {
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: 0,
    };

    await expect(refused(CompleteTimingAttemptDto, payload)).resolves.toEqual(
      [],
    );
  });

  it('refuses a negative last issued sequence', async () => {
    const payload = {
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: -1,
    };

    await expect(refused(CompleteTimingAttemptDto, payload)).resolves.toContain(
      'lastIssuedSequence',
    );
  });

  it('accepts taking and transferring the capture lock', async () => {
    await expect(
      refused(TakeCaptureDto, { workstationInstanceId: WORKSTATION }),
    ).resolves.toEqual([]);
    await expect(
      refused(TransferCaptureDto, { toWorkstationInstanceId: WORKSTATION }),
    ).resolves.toEqual([]);
  });

  it('refuses an epoch request without a workstation', async () => {
    await expect(refused(OpenClockEpochDto, {})).resolves.toContain(
      'workstationInstanceId',
    );
  });

  it('refuses a transfer without a target workstation', async () => {
    await expect(refused(TransferCaptureDto, {})).resolves.toContain(
      'toWorkstationInstanceId',
    );
  });
});

describe('SetRefereeRoleDto', () => {
  it.each([true, false])('accepts enabled=%p', async (enabled) => {
    await expect(refused(SetRefereeRoleDto, { enabled })).resolves.toEqual([]);
  });

  it('refuses a non-boolean enabled flag', async () => {
    for (const enabled of ['true', 1, null]) {
      await expect(refused(SetRefereeRoleDto, { enabled })).resolves.toContain(
        'enabled',
      );
    }
  });

  it('refuses a missing enabled flag', async () => {
    await expect(refused(SetRefereeRoleDto, {})).resolves.toContain('enabled');
  });
});
