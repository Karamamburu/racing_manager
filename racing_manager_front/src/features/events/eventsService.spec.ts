import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../shared/api/ApiClient';
import type {
  CreateEventRequest,
  EventDetails,
  StartInputRequest,
} from '../../shared/types/event';
import { eventsService } from './eventsService';

vi.mock('../../shared/api/ApiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    postResult: vi.fn(),
    patchResult: vi.fn(),
    putResult: vi.fn(),
    deleteResult: vi.fn(),
  },
}));

const START: StartInputRequest = {
  purposeType: 'CUP_RACE',
  formatIds: [1, 2],
  lapCount: 5,
  lapLengthMeters: 2000,
  displayName: null,
  sortOrder: 0,
};

function createPayload(): CreateEventRequest {
  return {
    name: 'Кубок',
    eventType: 'RACE',
    sport: 'RUN',
    eventDate: '2026-11-07',
    starts: [START],
  };
}

describe('EventsService payloads', () => {
  beforeEach(() => {
    vi.mocked(apiClient.postResult).mockReset();
    vi.mocked(apiClient.patchResult).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it('sends the full starts array on create', async () => {
    vi.mocked(apiClient.postResult).mockResolvedValue({
      status: 201,
      data: { id: 'event-1' },
    } as never);

    await eventsService.createEvent(createPayload());

    expect(apiClient.postResult).toHaveBeenCalledWith('/admin/events', {
      name: 'Кубок',
      eventType: 'RACE',
      sport: 'RUN',
      eventDate: '2026-11-07',
      starts: [START],
    });
  });

  it('omits starts entirely when a PATCH does not include them', async () => {
    vi.mocked(apiClient.patchResult).mockResolvedValue({
      status: 200,
      data: {} as EventDetails,
    } as never);
    const payload: CreateEventRequest = {
      name: 'Кубок',
      eventType: 'RACE',
      sport: 'RUN',
      eventDate: '2026-11-07',
    };

    await eventsService.updateEvent('event-1', payload);

    expect(apiClient.patchResult).toHaveBeenCalledWith(
      '/admin/events/event-1',
      payload,
    );
    expect(payload).not.toHaveProperty('starts');
  });

  it('sends startId when finishing a category', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({} as EventDetails);

    await eventsService.finishCategory('event-1', {
      startId: 'start-1',
      formatId: 2,
      gender: 'F',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/admin/events/event-1/categories/finish',
      { startId: 'start-1', formatId: 2, gender: 'F' },
    );
  });
});
