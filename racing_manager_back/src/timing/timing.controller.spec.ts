import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AnonymousSplitService } from './anonymous-split.service';
import { TimingController } from './timing.controller';
import { TimingExceptionFilter } from './timing.exception.filter';
import { TimingService } from './timing.service';
import type {
  StartTimingAttemptResult,
  TimingAnonymousSplitView,
  TimingCategoryBlockView,
  TimingPassView,
} from './timing.views';

/**
 * Contract of the MANUAL-TIMING controller (T9): the heat start and anonymous
 * assign/cancel routes are declared beside the existing routes, stay under the
 * class-level timing roles, validate their bodies and path ids, and reach their
 * service. No database is opened: the two services are stubs. The module wiring
 * itself is asserted by `timing.exception.filter.spec.ts`.
 */

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SPLIT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const PASS_ID = '55555555-5555-4555-8555-555555555555';
const ENROLLMENT_ID = '66666666-6666-4666-8666-666666666666';
const RACE_ID = '77777777-7777-4777-8777-777777777777';
const STAGE_ID = 'stage-1';
const BASE_PATH = `/events/${EVENT_ID}/timing`;

const HEAT_BLOCK: TimingCategoryBlockView = {
  startId: ENROLLMENT_ID,
  formatId: 1,
  gender: 'M',
  state: 'RUNNING',
  lapCount: 3,
  attemptId: ATTEMPT_ID,
  officialStartedAt: '2026-11-13T10:00:00.000Z',
  elapsedMs: 0,
  startControlEnabled: false,
  blockReason: null,
  participants: [],
  pendingFinishes: [],
  lastAttempts: [],
  kind: 'HEAT',
  blockKey: `heat:${RACE_ID}:${STAGE_ID}:1`,
  classCompetitionId: RACE_ID,
  stageId: STAGE_ID,
  stageLabel: 'Stage 1',
  stageState: 'SEEDED',
  heatNumber: 1,
  heatLabel: 'Heat 1',
};

const START_RESULT: StartTimingAttemptResult = {
  attempt: HEAT_BLOCK,
  epoch: {
    epochId: '88888888-8888-4888-8888-888888888888',
    attemptId: ATTEMPT_ID,
    officialElapsedAnchorMs: 0,
    serverNow: '2026-11-13T10:00:00.000Z',
  },
};

const PASS_VIEW: TimingPassView = {
  passId: PASS_ID,
  attemptId: ATTEMPT_ID,
  enrollmentId: ENROLLMENT_ID,
  lapNumber: 1,
  rawCapturedAt: '2026-11-13T10:00:12.000Z',
  officialAt: '2026-11-13T10:00:12.000Z',
  officialElapsedMs: 12_000,
  status: 'BOUND',
};

const RETIRED_SPLIT: TimingAnonymousSplitView = {
  splitId: SPLIT_ID,
  attemptId: ATTEMPT_ID,
  blockKey: `heat:${RACE_ID}:${STAGE_ID}:1`,
  attemptLabel: 'Race · Stage 1 · Heat 1',
  capturedAt: '2026-11-13T10:00:05.000Z',
  officialElapsedMs: 5_000,
  status: 'QUEUED',
  bound: true,
  candidates: [
    {
      attemptId: ATTEMPT_ID,
      blockKey: `heat:${RACE_ID}:${STAGE_ID}:1`,
      attemptLabel: 'Race · Stage 1 · Heat 1',
      officialElapsedMs: 5_000,
    },
  ],
  captureDeviceSequence: null,
};

const SURFACE = {
  eventId: EVENT_ID,
  captureWorkstationInstanceId: null,
  categories: [HEAT_BLOCK],
  anonymousSplits: [RETIRED_SPLIT],
};

/**
 * One handler of the controller prototype as a metadata target. The cast keeps
 * the reference unbound on purpose: the tests read decorator metadata, they
 * never call the handler.
 */
function handlerOf(name: string): object {
  return (TimingController.prototype as unknown as Record<string, object>)[
    name
  ];
}

function makeTimingService() {
  return {
    getSurface: jest.fn(() => Promise.resolve(SURFACE)),
    startAttempt: jest.fn(() => Promise.resolve(START_RESULT)),
    startHeatAttempt: jest.fn(() => Promise.resolve(START_RESULT)),
    capturePass: jest.fn(() => Promise.resolve(PASS_VIEW)),
  };
}

function makeAnonymousSplitService() {
  return {
    assign: jest.fn(() => Promise.resolve(PASS_VIEW)),
    cancel: jest.fn(() => Promise.resolve(RETIRED_SPLIT)),
  };
}

describe('TimingController routes', () => {
  let app: INestApplication;
  let timingService: ReturnType<typeof makeTimingService>;
  let anonymousSplitService: ReturnType<typeof makeAnonymousSplitService>;

  async function createApp(canActivateRoles: () => boolean = () => true) {
    timingService = makeTimingService();
    anonymousSplitService = makeAnonymousSplitService();
    const moduleRef = await Test.createTestingModule({
      controllers: [TimingController],
      providers: [
        { provide: TimingService, useValue: timingService },
        { provide: AnonymousSplitService, useValue: anonymousSplitService },
        TimingExceptionFilter,
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: canActivateRoles })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(
      (
        req: { session?: Record<string, unknown> },
        _res: unknown,
        next: () => void,
      ) => {
        req.session = { userSub: 'sub' };
        next();
      },
    );
    await app.init();
    return app.getHttpServer() as Server;
  }

  afterEach(async () => {
    await app?.close();
  });

  it('starts a heat attempt on POST heat-attempts with 201 and the fresh block', async () => {
    const server = await createApp();
    const body = {
      classCompetitionId: RACE_ID,
      stageId: STAGE_ID,
      heatNumber: 1,
      workstationInstanceId: 'workstation-1',
      clientStartedAt: '2026-11-13T10:00:00.000Z',
    };

    const response = await request(server)
      .post(`${BASE_PATH}/heat-attempts`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(START_RESULT);
    expect(timingService.startHeatAttempt).toHaveBeenCalledWith(
      'sub',
      EVENT_ID,
      body,
    );
  });

  it('assigns one split on POST splits/:splitId/assign with 200 and the idempotency key', async () => {
    const server = await createApp();
    const body = {
      startNumber: 12,
      workstationInstanceId: 'workstation-1',
      deviceSequence: 7,
    };

    const response = await request(server)
      .post(`${BASE_PATH}/splits/${SPLIT_ID}/assign`)
      .set('Idempotency-Key', 'key-1')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PASS_VIEW);
    expect(anonymousSplitService.assign).toHaveBeenCalledWith(
      'sub',
      EVENT_ID,
      SPLIT_ID,
      body,
      'key-1',
    );
  });

  it('cancels one split on POST splits/:splitId/cancel with 200 and the retired entry', async () => {
    const server = await createApp();
    const body = { reason: 'captured by mistake' };

    const response = await request(server)
      .post(`${BASE_PATH}/splits/${SPLIT_ID}/cancel`)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(RETIRED_SPLIT);
    expect(anonymousSplitService.cancel).toHaveBeenCalledWith(
      'sub',
      EVENT_ID,
      SPLIT_ID,
      body,
    );
  });

  it('refuses an assign body that names two identities with 400 and no service call', async () => {
    const server = await createApp();

    const response = await request(server)
      .post(`${BASE_PATH}/splits/${SPLIT_ID}/assign`)
      .send({
        startNumber: 12,
        enrollmentId: ENROLLMENT_ID,
        workstationInstanceId: 'workstation-1',
        deviceSequence: 7,
      });

    expect(response.status).toBe(400);
    expect(anonymousSplitService.assign).not.toHaveBeenCalled();
  });

  it('refuses a non-UUID split id with 400 before the service', async () => {
    const server = await createApp();

    const response = await request(server)
      .post(`${BASE_PATH}/splits/not-a-uuid/assign`)
      .send({
        startNumber: 12,
        workstationInstanceId: 'workstation-1',
        deviceSequence: 7,
      });

    expect(response.status).toBe(400);
    expect(anonymousSplitService.assign).not.toHaveBeenCalled();
  });

  it('refuses a missing timing role on the new routes with 403', async () => {
    const server = await createApp(() => false);

    const heat = await request(server).post(`${BASE_PATH}/heat-attempts`).send({
      classCompetitionId: RACE_ID,
      stageId: STAGE_ID,
      heatNumber: 1,
      workstationInstanceId: 'workstation-1',
      clientStartedAt: '2026-11-13T10:00:00.000Z',
    });
    const cancel = await request(server)
      .post(`${BASE_PATH}/splits/${SPLIT_ID}/cancel`)
      .send({ reason: 'captured by mistake' });

    expect(heat.status).toBe(403);
    expect(cancel.status).toBe(403);
    expect(timingService.startHeatAttempt).not.toHaveBeenCalled();
    expect(anonymousSplitService.cancel).not.toHaveBeenCalled();
  });

  it('keeps the existing surface, category start and capture routes', async () => {
    const server = await createApp();

    const surface = await request(server).get(BASE_PATH);
    const start = await request(server).post(`${BASE_PATH}/attempts`).send({
      startId: ENROLLMENT_ID,
      formatId: 1,
      gender: 'M',
      workstationInstanceId: 'workstation-1',
      clientStartedAt: '2026-11-13T10:00:00.000Z',
    });
    const capture = await request(server).post(`${BASE_PATH}/passes`).send({
      attemptId: ATTEMPT_ID,
      kind: 'ANONYMOUS_SPLIT',
      clockEpochId: START_RESULT.epoch.epochId,
      workstationInstanceId: 'workstation-1',
      deviceSequence: 8,
      clientCapturedAt: '2026-11-13T10:00:05.000Z',
      clientElapsedMs: 5_000,
    });

    expect(surface.status).toBe(200);
    expect(start.status).toBe(201);
    expect(capture.status).toBe(201);
    expect(timingService.capturePass).toHaveBeenCalledTimes(1);
  });

  it('declares the new route paths, verbs and success statuses', () => {
    const routes: Array<[string, string, number]> = [
      ['startHeatAttempt', 'heat-attempts', 201],
      ['assignSplit', 'splits/:splitId/assign', 200],
      ['cancelSplit', 'splits/:splitId/cancel', 200],
      ['startAttempt', 'attempts', 201],
      ['capturePass', 'passes', 201],
      ['getSurface', '/', 200],
    ];
    for (const [handler, path, status] of routes) {
      const target = handlerOf(handler);
      expect(Reflect.getMetadata(PATH_METADATA, target)).toBe(path);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, target) ?? 200).toBe(
        status,
      );
    }
    expect(Reflect.getMetadata(METHOD_METADATA, handlerOf('getSurface'))).toBe(
      RequestMethod.GET,
    );
    for (const handler of ['startHeatAttempt', 'assignSplit', 'cancelSplit']) {
      expect(Reflect.getMetadata(METHOD_METADATA, handlerOf(handler))).toBe(
        RequestMethod.POST,
      );
    }
    expect(Reflect.getMetadata(PATH_METADATA, TimingController)).toBe(
      'events/:eventId/timing',
    );
  });

  it('keeps the class-level timing roles and adds no second role for cancel', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TimingController)).toEqual(
      TIMING_OPERATE_ROLE_CODES,
    );
    for (const handler of ['cancelSplit', 'assignSplit', 'startHeatAttempt']) {
      expect(
        Reflect.getMetadata(ROLES_KEY, handlerOf(handler)),
      ).toBeUndefined();
    }
  });
});
