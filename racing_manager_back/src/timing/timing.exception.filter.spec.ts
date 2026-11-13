import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import {
  FILTER_CATCH_EXCEPTIONS,
  MODULE_METADATA,
} from '@nestjs/common/constants';
import { AuthModule } from '../auth/auth.module';
import { ClassCompetitionsModule } from '../class-competitions/class-competitions.module';
import { AnonymousSplitService } from './anonymous-split.service';
import { TimingAttemptsReadModule } from './timing-attempts-read.module';
import { TimingController } from './timing.controller';
import { TimingErrorCode, TimingDomainError } from './timing.errors';
import {
  TimingExceptionFilter,
  TIMING_ERROR_STATUS,
  type TimingErrorBody,
} from './timing.exception.filter';
import { TimingModule } from './timing.module';
import { TimingRepository } from './timing.repository';
import { TimingService } from './timing.service';

/** The two `Response` members the filter touches. */
type ResponseStub = {
  status: jest.Mock<ResponseStub, [number]>;
  json: jest.Mock<ResponseStub, [unknown]>;
};

function makeResponseStub(): ResponseStub {
  const response = {} as ResponseStub;
  response.status = jest.fn<ResponseStub, [number]>(() => response);
  response.json = jest.fn<ResponseStub, [unknown]>(() => response);
  return response;
}

function makeHost(response: ResponseStub): ArgumentsHost {
  const http = {
    getResponse: () => response,
  };
  return { switchToHttp: () => http } as unknown as ArgumentsHost;
}

function catchDomainError(
  code: TimingErrorCode,
  details?: Readonly<Record<string, unknown>>,
): TimingErrorBody {
  const response = makeResponseStub();
  const filter = new TimingExceptionFilter();
  const message = `refused: ${code}`;

  filter.catch(
    new TimingDomainError(code, message, details),
    makeHost(response),
  );

  expect(response.status).toHaveBeenCalledTimes(1);
  expect(response.json).toHaveBeenCalledTimes(1);
  const body = response.json.mock.calls[0][0] as TimingErrorBody;
  expect(body.statusCode).toBe(response.status.mock.calls[0][0]);
  expect(body.code).toBe(code);
  expect(body.message).toBe(message);
  return body;
}

describe('TimingExceptionFilter', () => {
  it.each([
    ['NOT_FOUND', TimingErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND],
    ['ROLE_REQUIRED', TimingErrorCode.ROLE_REQUIRED, HttpStatus.FORBIDDEN],
    ['ATTEMPT_RUNNING', TimingErrorCode.ATTEMPT_RUNNING, HttpStatus.CONFLICT],
    ['OUT_OF_BOUNDS', TimingErrorCode.OUT_OF_BOUNDS, HttpStatus.BAD_REQUEST],
  ])(
    'maps %s to %s with the domain code and message',
    (_label, code, status) => {
      const body = catchDomainError(code);

      expect(body).toEqual({
        statusCode: status,
        code,
        message: `refused: ${code}`,
      });
    },
  );

  it('pins the whole code table to 400, 403, 404 or 409', () => {
    const expected: Record<TimingErrorCode, HttpStatus> = {
      [TimingErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
      [TimingErrorCode.ROLE_REQUIRED]: HttpStatus.FORBIDDEN,
      [TimingErrorCode.NOT_AVAILABLE]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.NO_TIMEABLE_PARTICIPANT]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.MISSING_START_NUMBER]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.NUMBER_REQUIRED]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.NUMBER_UNKNOWN]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.NUMBER_AMBIGUOUS]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.EXCLUDED_PARTICIPANT]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.OUT_OF_BOUNDS]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.REASON_REQUIRED]: HttpStatus.BAD_REQUEST,
      [TimingErrorCode.CAPTURE_HELD]: HttpStatus.CONFLICT,
      [TimingErrorCode.CAPTURE_NOT_HELD]: HttpStatus.CONFLICT,
      [TimingErrorCode.ATTEMPT_RUNNING]: HttpStatus.CONFLICT,
      [TimingErrorCode.ATTEMPT_CLOSED]: HttpStatus.CONFLICT,
      [TimingErrorCode.CATEGORY_FINISHED]: HttpStatus.CONFLICT,
      [TimingErrorCode.ALREADY_N_PASSES]: HttpStatus.CONFLICT,
      [TimingErrorCode.PENDING_REMAINS]: HttpStatus.CONFLICT,
      [TimingErrorCode.UNCONFIRMED_MUTATIONS]: HttpStatus.CONFLICT,
      [TimingErrorCode.PARTICIPANTS_BELOW_LAPS]: HttpStatus.CONFLICT,
      [TimingErrorCode.CONFLICT]: HttpStatus.CONFLICT,
      [TimingErrorCode.RACE_CREATION_BLOCKED]: HttpStatus.CONFLICT,
      [TimingErrorCode.INVALID_STATE]: HttpStatus.CONFLICT,
    };

    expect(TIMING_ERROR_STATUS).toEqual(expected);
    const codes = Object.values(TimingErrorCode) as TimingErrorCode[];
    expect(Object.keys(TIMING_ERROR_STATUS).sort()).toEqual(codes.sort());
  });

  it('keeps the details of the refusal in the body', () => {
    const body = catchDomainError(TimingErrorCode.OUT_OF_BOUNDS, {
      officialElapsedMs: -1,
    });

    expect(body.details).toEqual({ officialElapsedMs: -1 });
  });

  it('omits details when the refusal carries none', () => {
    const body = catchDomainError(TimingErrorCode.ROLE_REQUIRED);

    expect(body).not.toHaveProperty('details');
  });

  it('catches TimingDomainError only, so an unknown error keeps its handler', () => {
    const caught: unknown = Reflect.getMetadata(
      FILTER_CATCH_EXCEPTIONS,
      TimingExceptionFilter,
    );

    expect(caught).toEqual([TimingDomainError]);
  });
});

describe('TimingModule metadata', () => {
  it('registers the controller, its providers and the guard module imports', () => {
    const imports: unknown = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      TimingModule,
    );
    const controllers: unknown = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      TimingModule,
    );
    const providers: unknown = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      TimingModule,
    );

    expect(imports).toEqual([
      AuthModule,
      TimingAttemptsReadModule,
      ClassCompetitionsModule,
    ]);
    expect(controllers).toEqual([TimingController]);
    expect(providers).toEqual([
      TimingService,
      TimingRepository,
      AnonymousSplitService,
      TimingExceptionFilter,
    ]);
  });
});
