import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ParticipationFormat } from '../../shared/types/event';
import {
  EventStartsFormItems,
  buildStartsPayload,
  defaultStartValue,
} from './EventStartsFormItems';

const formats: ParticipationFormat[] = [
  { id: 1, sport: 'RUN', code: '5K', name: '5 км', sortOrder: 1 },
  { id: 2, sport: 'RUN', code: '10K', name: '10 км', sortOrder: 2 },
];

describe('buildStartsPayload', () => {
  it('builds one start with kilometre lengths converted to metres', () => {
    expect(
      buildStartsPayload([
        {
          purposeType: 'CUP_RACE',
          formatIds: [1, 2],
          lapCount: 5,
          lapLengthKm: 2,
          displayName: '  Элита ',
        },
      ]),
    ).toEqual([
      {
        purposeType: 'CUP_RACE',
        formatIds: [1, 2],
        lapCount: 5,
        lapLengthMeters: 2000,
        displayName: 'Элита',
        sortOrder: 0,
      },
    ]);
  });

  it('keeps ids for existing starts and assigns sort order by position', () => {
    const payload = buildStartsPayload([
      {
        id: 'start-a',
        purposeType: 'CUP_RACE',
        formatIds: [1],
        lapCount: 1,
        lapLengthKm: 1,
        displayName: null,
      },
      {
        purposeType: 'CONTROL_TRAINING',
        formatIds: [2],
        lapCount: 2,
        lapLengthKm: 0.5,
      },
    ]);

    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ id: 'start-a', sortOrder: 0 });
    expect(payload[1]).not.toHaveProperty('id');
    expect(payload[1]).toMatchObject({
      purposeType: 'CONTROL_TRAINING',
      lapLengthMeters: 500,
      displayName: null,
      sortOrder: 1,
    });
  });

  it('defaults a new start to CUP_RACE with every sport format', () => {
    expect(defaultStartValue(formats)).toMatchObject({
      purposeType: 'CUP_RACE',
      formatIds: [1, 2],
      lapCount: 1,
      lapLengthKm: 1,
    });
  });
});

describe('EventStartsFormItems', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders one default start and adds a second', async () => {
    render(
      <Form initialValues={{ starts: [defaultStartValue(formats)] }}>
        <EventStartsFormItems formats={formats} />
      </Form>,
    );

    expect(screen.queryByText('Старт 1')).not.toBeNull();
    expect(screen.queryByText('Старт 2')).toBeNull();

    fireEvent.click(screen.getByText('+ Добавить старт'));

    await waitFor(() => {
      expect(screen.queryByText('Старт 2')).not.toBeNull();
    });
  });
});
