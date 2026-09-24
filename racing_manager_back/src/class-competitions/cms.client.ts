import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CmsCompetition, CmsHeatResult } from './cms.types';

type CmsErrorBody = { message?: string };

@Injectable()
export class CmsClient {
  private readonly logger = new Logger(CmsClient.name);

  constructor(private readonly config: ConfigService) {}

  createCompetition(body: {
    name: string;
    participants: Array<{ id: string; seed: number }>;
  }): Promise<CmsCompetition> {
    return this.request('POST', '/v1/competitions', body);
  }

  getCompetition(id: string): Promise<CmsCompetition> {
    return this.request('GET', `/v1/competitions/${id}`);
  }

  updatePlan(id: string, body: unknown): Promise<CmsCompetition> {
    return this.request('PUT', `/v1/competitions/${id}/plan`, body);
  }

  seedStage(id: string, stageId: string): Promise<CmsCompetition> {
    return this.request(
      'POST',
      `/v1/competitions/${id}/stages/${encodeURIComponent(stageId)}/start-lists`,
      {},
    );
  }

  reassignHeats(
    id: string,
    stageId: string,
    heats: Array<{ heatNumber: number; participantIds: string[] }>,
  ): Promise<CmsCompetition> {
    return this.request(
      'PUT',
      `/v1/competitions/${id}/stages/${encodeURIComponent(stageId)}/heats`,
      { heats },
    );
  }

  recordResults(
    id: string,
    stageId: string,
    heatResults: CmsHeatResult[],
  ): Promise<CmsCompetition> {
    return this.request(
      'PUT',
      `/v1/competitions/${id}/stages/${encodeURIComponent(stageId)}/results`,
      { heatResults },
    );
  }

  completeStage(id: string, stageId: string): Promise<CmsCompetition> {
    return this.request(
      'POST',
      `/v1/competitions/${id}/stages/${encodeURIComponent(stageId)}/complete`,
    );
  }

  setStageField(id: string, stageId: string, participantIds: string[]): Promise<CmsCompetition> {
    return this.request(
      'PUT',
      `/v1/competitions/${id}/stages/${encodeURIComponent(stageId)}/field`,
      { participantIds },
    );
  }

  advanceStage(id: string, stageId: string): Promise<CmsCompetition> {
    return this.request(
      'POST',
      `/v1/competitions/${id}/stages/${encodeURIComponent(stageId)}/advance`,
      {},
    );
  }

  private baseUrl(): string {
    const configured = this.config.get<string>('CMS_BASE_URL') ?? 'http://localhost:4100';
    return configured.replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.logger.warn({
        event: 'cms.request_failed',
        method,
        path,
        reason: 'network',
      });
      throw new BadGatewayException('Сервис сеток недоступен.');
    }

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as T & CmsErrorBody) : null;
    if (!response.ok) {
      this.logger.warn({
        event: 'cms.request_failed',
        method,
        path,
        status: response.status,
      });
      const message = payload?.message || `Competition service returned ${response.status}.`;
      if (response.status === 404) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
    return payload as T;
  }
}
