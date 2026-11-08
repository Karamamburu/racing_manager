import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

afterEach(cleanup);

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

  it('keeps the per-start name before purpose and other fields', () => {
    render(
      <Form initialValues={{ starts: [defaultStartValue(formats)] }}>
        <EventStartsFormItems formats={formats} />
      </Form>,
    );

    const name = screen.getByText('Название');
    const purpose = screen.getByText('Назначение');
    expect(
      name.compareDocumentPosition(purpose) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('adds and removes start tabs while preserving values', async () => {
    render(
      <Form initialValues={{ starts: [defaultStartValue(formats)] }}>
        <EventStartsFormItems formats={formats} />
      </Form>,
    );

    const [nameInput] = screen.getAllByPlaceholderText('Например, Элита');
    fireEvent.change(nameInput, { target: { value: 'Элита' } });

    fireEvent.click(screen.getByText('+ Добавить старт'));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Старт 2' })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Старт 1' }));
    expect(
      (screen.getAllByPlaceholderText('Например, Элита')[0] as HTMLInputElement)
        .value,
    ).toBe('Элита');

    fireEvent.click(screen.getByRole('tab', { name: 'Старт 2' }));
    fireEvent.click(screen.getAllByText('Удалить старт')[1]);
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Старт 2' })).toBeNull();
    });
    expect(screen.getByRole('tab', { name: 'Старт 1' })).not.toBeNull();
  });

  it('shows the computed distance as read-only text', () => {
    render(
      <Form
        initialValues={{
          starts: [
            {
              purposeType: 'CUP_RACE',
              formatIds: [1],
              lapCount: 5,
              lapLengthKm: 2,
              displayName: null,
            },
          ],
        }}
      >
        <EventStartsFormItems formats={formats} />
      </Form>,
    );

    expect(screen.queryByText('Дистанция: 10 км')).not.toBeNull();
    expect(screen.queryByLabelText('Дистанция')).toBeNull();
  });

  it('renders one default start and adds a second', async () => {
    render(
      <Form initialValues={{ starts: [defaultStartValue(formats)] }}>
        <EventStartsFormItems formats={formats} />
      </Form>,
    );

    expect(screen.getAllByText('Старт 1').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Старт 2')).toHaveLength(0);

    fireEvent.click(screen.getByText('+ Добавить старт'));

    await waitFor(() => {
      expect(screen.getAllByText('Старт 2').length).toBeGreaterThan(0);
    });
  });
});
