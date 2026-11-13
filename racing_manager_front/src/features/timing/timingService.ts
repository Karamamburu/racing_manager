import { apiClient } from '../../shared/api/ApiClient';
import type {
  BindPendingFinishRequest,
  CancelPendingFinishRequest,
  CancelTimingAttemptRequest,
  CancelTimingPassRequest,
  CaptureTimingPassRequest,
  CompleteTimingAttemptRequest,
  CorrectOfficialTimeRequest,
  ForceCompleteTimingAttemptRequest,
  ForceReleaseCaptureRequest,
  OpenClockEpochRequest,
  QuickUndoTimingPassRequest,
  RebindTimingPassRequest,
  StartTimingAttemptRequest,
  StartTimingAttemptResult,
  TakeCaptureRequest,
  TimingAttemptRecordView,
  TimingCaptureView,
  TimingClockEpochView,
  TimingPassView,
  TimingSurfaceView,
  TransferCaptureRequest,
} from './types';

/** Header the API replay interceptor reads; absent means "do not replay". */
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * HTTP client of the MANUAL-TIMING routes.
 *
 * This is the only front module that knows a timing URL or an HTTP verb. It
 * forwards the body unchanged and lets `apiClient` errors (400/403/404/409)
 * propagate: the rules and their messages belong to the API, so the surface can
 * render the refusal the server returned instead of re-implementing it.
 */
export class TimingService {
  private base(eventId: string): string {
    return `/events/${eventId}/timing`;
  }

  /**
   * Sends one mutation, adding the replay header only when the caller supplied
   * a key so an unkeyed call stays byte-identical in tests and in the network
   * tab.
   */
  private post<TResponse>(
    url: string,
    payload: unknown,
    idempotencyKey?: string,
  ): Promise<TResponse> {
    return idempotencyKey
      ? apiClient.post<TResponse>(url, payload, {
          headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
        })
      : apiClient.post<TResponse>(url, payload);
  }

  public async getSurface(eventId: string): Promise<TimingSurfaceView> {
    return apiClient.get<TimingSurfaceView>(this.base(eventId));
  }

  public async getAttemptRecord(
    eventId: string,
    attemptId: string,
  ): Promise<TimingAttemptRecordView> {
    return apiClient.get<TimingAttemptRecordView>(
      `${this.base(eventId)}/attempts/${attemptId}`,
    );
  }

  public async startAttempt(
    eventId: string,
    payload: StartTimingAttemptRequest,
    idempotencyKey?: string,
  ): Promise<StartTimingAttemptResult> {
    return this.post<StartTimingAttemptResult>(
      `${this.base(eventId)}/attempts`,
      payload,
      idempotencyKey,
    );
  }

  public async openClockEpoch(
    eventId: string,
    attemptId: string,
    payload: OpenClockEpochRequest,
    idempotencyKey?: string,
  ): Promise<TimingClockEpochView> {
    return this.post<TimingClockEpochView>(
      `${this.base(eventId)}/attempts/${attemptId}/clock-epochs`,
      payload,
      idempotencyKey,
    );
  }

  public async capturePass(
    eventId: string,
    payload: CaptureTimingPassRequest,
    idempotencyKey: string,
  ): Promise<TimingPassView> {
    return this.post<TimingPassView>(
      `${this.base(eventId)}/passes`,
      payload,
      idempotencyKey,
    );
  }

  public async bindPendingFinish(
    eventId: string,
    pendingFinishId: string,
    payload: BindPendingFinishRequest,
    idempotencyKey: string,
  ): Promise<TimingPassView> {
    return this.post<TimingPassView>(
      `${this.base(eventId)}/pending-finishes/${pendingFinishId}/bind`,
      payload,
      idempotencyKey,
    );
  }

  public async cancelPendingFinish(
    eventId: string,
    pendingFinishId: string,
    payload: CancelPendingFinishRequest,
  ): Promise<TimingPassView> {
    return this.post<TimingPassView>(
      `${this.base(eventId)}/pending-finishes/${pendingFinishId}/cancel`,
      payload,
    );
  }

  public async correctOfficialTime(
    eventId: string,
    passId: string,
    payload: CorrectOfficialTimeRequest,
  ): Promise<TimingPassView> {
    const result = await apiClient.patchResult<TimingPassView>(
      `${this.base(eventId)}/passes/${passId}/official-time`,
      payload,
    );
    return result.data;
  }

  public async cancelPass(
    eventId: string,
    passId: string,
    payload: CancelTimingPassRequest,
  ): Promise<TimingPassView> {
    return this.post<TimingPassView>(
      `${this.base(eventId)}/passes/${passId}/cancel`,
      payload,
    );
  }

  public async rebindPass(
    eventId: string,
    passId: string,
    payload: RebindTimingPassRequest,
  ): Promise<TimingPassView> {
    return this.post<TimingPassView>(
      `${this.base(eventId)}/passes/${passId}/rebind`,
      payload,
    );
  }

  public async quickUndo(
    eventId: string,
    attemptId: string,
    payload: QuickUndoTimingPassRequest,
    idempotencyKey: string,
  ): Promise<TimingPassView> {
    return this.post<TimingPassView>(
      `${this.base(eventId)}/attempts/${attemptId}/undo`,
      payload,
      idempotencyKey,
    );
  }

  public async completeAttempt(
    eventId: string,
    attemptId: string,
    payload: CompleteTimingAttemptRequest,
    idempotencyKey: string,
  ): Promise<TimingAttemptRecordView> {
    return this.post<TimingAttemptRecordView>(
      `${this.base(eventId)}/attempts/${attemptId}/complete`,
      payload,
      idempotencyKey,
    );
  }

  public async forceCompleteAttempt(
    eventId: string,
    attemptId: string,
    payload: ForceCompleteTimingAttemptRequest,
  ): Promise<TimingAttemptRecordView> {
    return this.post<TimingAttemptRecordView>(
      `${this.base(eventId)}/attempts/${attemptId}/force-complete`,
      payload,
    );
  }

  public async cancelAttempt(
    eventId: string,
    attemptId: string,
    payload: CancelTimingAttemptRequest,
  ): Promise<TimingAttemptRecordView> {
    return this.post<TimingAttemptRecordView>(
      `${this.base(eventId)}/attempts/${attemptId}/cancel`,
      payload,
    );
  }

  public async takeCapture(
    eventId: string,
    payload: TakeCaptureRequest,
    idempotencyKey?: string,
  ): Promise<TimingCaptureView> {
    return this.post<TimingCaptureView>(
      `${this.base(eventId)}/capture/take`,
      payload,
      idempotencyKey,
    );
  }

  public async transferCapture(
    eventId: string,
    payload: TransferCaptureRequest,
    idempotencyKey?: string,
  ): Promise<TimingCaptureView> {
    return this.post<TimingCaptureView>(
      `${this.base(eventId)}/capture/transfer`,
      payload,
      idempotencyKey,
    );
  }

  public async forceReleaseCapture(
    eventId: string,
    payload: ForceReleaseCaptureRequest,
  ): Promise<TimingCaptureView> {
    return this.post<TimingCaptureView>(
      `${this.base(eventId)}/capture/force-release`,
      payload,
    );
  }
}

export const timingService = new TimingService();
