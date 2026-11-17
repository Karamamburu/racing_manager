import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import {
  TIMING_SEND_QUEUE_AREA_HEIGHT,
  TimingSendQueue,
} from './TimingSendQueue';
import {
  TIMING_OFFLINE_ENTRY_KINDS,
  TIMING_OFFLINE_ENTRY_KIND_LABELS,
  type TimingOfflineEntryKind,
  type TimingOfflineEntryView,
} from './timingOffline';

/**
 * MANUAL-TIMING-4, Wave 6: the send queue of the timing page.
 *
 * The queue lists only entries the device recorded and the server has not
 * answered (FR-12). A refusal is reported once and removed by the hook, so it
 * never becomes a queue row. The figures come from the page ("Не отправлено: N"
 * counts entries, never marks).
 *
 * Every state word the referee reads is present in text, so no cue depends on
 * colour (U-04, FR-09): the unsent row says «не отправлено», and an empty queue
 * says «Всё отправлено».
 */

/** A local-wall-clock instant, so the rendered `HH:mm:ss.SSS` is timezone-safe. */
function localIso(
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds = 0,
): string {
  return new Date(
    2026,
    10,
    16,
    hours,
    minutes,
    seconds,
    milliseconds,
  ).toISOString();
}

/** The row label of every kind the queue can hold, as the referee reads it. */
const KIND_LABELS: Record<TimingOfflineEntryKind, string> = {
  NUMBER: 'Отметка по номеру',
  TILE: 'Отметка по плитке',
  PENDING_FINISH: 'Непривязанный финиш',
  ANONYMOUS_SPLIT: 'Отсечка без номера',
  PASS: 'Отметка',
  BIND: 'Привязка финиша',
  UNDO: 'Отмена отметки',
  ANONYMOUS_ASSIGN: 'Присвоение отсечки',
};

function entry(
  overrides: Partial<TimingOfflineEntryView> = {},
): TimingOfflineEntryView {
  const kind = overrides.kind ?? 'NUMBER';
  const status = overrides.status ?? 'PENDING';
  return {
    id: 'entry-1',
    kind,
    kindLabel: TIMING_OFFLINE_ENTRY_KIND_LABELS[kind],
    operation: 'PASS',
    status,
    unsent: status === 'PENDING' || status === 'SENT',
    rejected: status === 'REJECTED',
    pressTime: localIso(9, 1, 0, 250),
    attemptId: 'attempt-a',
    blockKey: 'block-a',
    enrollmentId: 'enr-14',
    startNumber: 14,
    fullName: 'Иванов Иван',
    sectionId: 'section-1',
    pendingMarks: 1,
    confirmedLapsRetired: 0,
    withdraws: null,
    pairId: null,
    pairRole: null,
    reason: status === 'REJECTED' ? 'Попытка уже закрыта сервером' : null,
    ...overrides,
  };
}

/** A block-free anonymous split: no participant, no block (E-15, FR-38). */
function anonymousSplit(
  overrides: Partial<TimingOfflineEntryView> = {},
): TimingOfflineEntryView {
  return entry({
    id: 'entry-split',
    kind: 'ANONYMOUS_SPLIT',
    attemptId: null,
    blockKey: null,
    enrollmentId: null,
    startNumber: null,
    fullName: null,
    sectionId: null,
    pendingMarks: 0,
    pressTime: localIso(9, 2, 0, 5),
    ...overrides,
  });
}

function props(
  overrides: Partial<ComponentProps<typeof TimingSendQueue>> = {},
): ComponentProps<typeof TimingSendQueue> {
  return {
    entries: [],
    unsentEntries: 0,
    isOnline: true,
    isSending: false,
    onSendNow: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}


function queueArea(): HTMLElement {
  return screen.getByRole('list', { name: 'Очередь отправки' });
}

/**
 * One colour in the notation jsdom reports, so a comparison never depends on
 * whether a value came back as `#rrggbb` or as `rgb(r, g, b)`.
 */
function colour(value: string): string {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!hex) return value;
  return `rgb(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(
    hex[3],
    16,
  )})`;
}

function rows(): HTMLElement[] {
  return within(queueArea()).getAllByRole('listitem');
}

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

afterEach(cleanup);

describe('TimingSendQueue unsent entries', () => {
  it('lists the unsent entries with the count and sends them on demand', async () => {
    const onSendNow = vi.fn(() => Promise.resolve());
    render(
      <TimingSendQueue
        {...props({
          entries: [entry(), anonymousSplit()],
          unsentEntries: 2,
          onSendNow,
        })}
      />,
    );

    expect(screen.getByText('Очередь отправки')).not.toBeNull();
    expect(screen.getByText('Не отправлено: 2')).not.toBeNull();
    expect(rows()).toHaveLength(2);

    // One press of «Отправить сейчас» asks the page to send the queue once
    // (S-07, FR-13); the pending-figure words never turn into a failure.
    fireEvent.click(screen.getByRole('button', { name: /Отправить сейчас/ }));
    await waitFor(() => expect(onSendNow).toHaveBeenCalledTimes(1));
  });

  it('keeps the send control busy and inert while a send is in flight', async () => {
    const onSendNow = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <TimingSendQueue
        {...props({ entries: [entry()], unsentEntries: 1, isSending: true })}
      />,
    );

    const busy = screen.getByRole('button', {
      name: /Отправить сейчас/,
    }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.className).toContain('ant-btn-loading');
    fireEvent.click(busy);
    expect(onSendNow).not.toHaveBeenCalled();

    rerender(
      <TimingSendQueue
        {...props({ entries: [entry()], unsentEntries: 1, onSendNow })}
      />,
    );
    const ready = screen.getByRole('button', {
      name: /Отправить сейчас/,
    }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    await waitFor(() => expect(onSendNow).toHaveBeenCalledTimes(1));
  });

  it('does not offer the send control when nothing is unsent', () => {
    render(<TimingSendQueue {...props()} />);

    expect(
      screen.queryByRole('button', { name: /Отправить сейчас/ }),
    ).toBeNull();
  });
});

describe('TimingSendQueue empty and connection states', () => {
  it('says everything is sent when nothing is queued', () => {
    render(<TimingSendQueue {...props()} />);

    expect(screen.getByText('Всё отправлено')).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: /Отправить сейчас/ }),
    ).toBeNull();
    expect(screen.queryByText('Не отправлено: 0')).toBeNull();
    // An empty queue is a quiet fact, never an error state.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.ant-alert')).toBeNull();
  });

  it('states the lost connection while entries wait, without an error state', () => {
    const { rerender } = render(
      <TimingSendQueue
        {...props({ entries: [entry()], unsentEntries: 1, isOnline: false })}
      />,
    );

    expect(screen.getByText('Нет связи с сервером')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.ant-alert')).toBeNull();
    // The rows and the count stay visible while the connection is gone
    // (S-04, FR-11).
    expect(screen.getByText('Не отправлено: 1')).not.toBeNull();
    expect(rows()).toHaveLength(1);

    rerender(
      <TimingSendQueue
        {...props({ entries: [entry()], unsentEntries: 1 })}
      />,
    );
    expect(screen.queryByText('Нет связи с сервером')).toBeNull();

    // The hint belongs to the unsent report and disappears with a resolved
    // queue (UC-04); «Всё отправлено» stays the only message.
    rerender(<TimingSendQueue {...props({ isOnline: false })} />);
    expect(screen.queryByText('Нет связи с сервером')).toBeNull();
    expect(screen.getByText('Всё отправлено')).not.toBeNull();
  });
});

describe('TimingSendQueue rows', () => {
  it('names the block, the participant and the press clock of a capture', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [
            entry(),
            entry({
              id: 'entry-2',
              kind: 'TILE',
              blockKey: 'block-b',
              startNumber: 21,
              fullName: 'Сидорова Анна',
              pressTime: localIso(9, 2, 30, 500),
            }),
            anonymousSplit(),
          ],
          unsentEntries: 3,
        })}
      />,
    );

    const [numberRow, tileRow, splitRow] = rows();
    expect(numberRow.textContent).toContain('Отметка по номеру');
    expect(numberRow.textContent).toContain('Блок: block-a');
    expect(numberRow.textContent).toContain('№ 14');
    expect(numberRow.textContent).toContain('Иванов Иван');
    expect(numberRow.textContent).toContain('Отметка: 09:01:00.250');

    expect(tileRow.textContent).toContain('Отметка по плитке');
    expect(tileRow.textContent).toContain('Блок: block-b');
    expect(tileRow.textContent).toContain('№ 21');
    expect(tileRow.textContent).toContain('Сидорова Анна');
    expect(tileRow.textContent).toContain('Отметка: 09:02:30.500');

    // An anonymous split never reads as belonging to a participant or a block
    // (E-15, FR-12).
    expect(splitRow.textContent).toContain('Отсечка без номера');
    expect(splitRow.textContent).not.toContain('Блок:');
    expect(splitRow.textContent).not.toContain('№');
    expect(splitRow.textContent).toContain('Отметка: 09:02:00.005');
  });

  it('labels every entry kind the queue can hold', () => {
    const kinds = [...TIMING_OFFLINE_ENTRY_KINDS];
    render(
      <TimingSendQueue
        {...props({
          entries: kinds.map((kind, index) =>
            entry({ id: `entry-${index}`, kind }),
          ),
          unsentEntries: kinds.length,
        })}
      />,
    );

    const rendered = rows();
    expect(rendered).toHaveLength(kinds.length);
    kinds.forEach((kind, index) => {
      expect(rendered[index].textContent).toContain(KIND_LABELS[kind]);
    });
  });

  it('names the capture a withdrawal retires', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [
            entry({
              kind: 'UNDO',
              operation: 'UNDO',
              pendingMarks: 0,
              withdraws: {
                entryId: 'entry-1',
                startNumber: 14,
                fullName: 'Иванов Иван',
                blockKey: 'block-a',
                confirmed: true,
              },
            }),
          ],
          unsentEntries: 1,
        })}
      />,
    );

    const row = rows()[0];
    expect(row.textContent).toContain('Отмена отметки');
    expect(row.textContent).toContain('Отменяет отметку: № 14 Иванов Иван');
    expect(within(row).getByText('не отправлено')).not.toBeNull();
  });
});

describe('TimingSendQueue layout', () => {
  it('keeps the entry area stable and scrollable across states', () => {
    const { rerender } = render(<TimingSendQueue {...props()} />);

    expect(queueArea().style.minHeight).toBe(
      `${TIMING_SEND_QUEUE_AREA_HEIGHT}px`,
    );
    expect(queueArea().style.overflowY).toBe('auto');
    const emptyHeight = queueArea().style.minHeight;

    rerender(
      <TimingSendQueue
        {...props({ entries: [entry(), anonymousSplit()], unsentEntries: 2 })}
      />,
    );

    // A growing queue scrolls inside the same area, so the field and the
    // blocks around it never move (S-04, S-06).
    expect(queueArea().style.minHeight).toBe(emptyHeight);
    expect(queueArea().style.overflowY).toBe('auto');
    expect(queueArea().style.minHeight).toBe(
      `${TIMING_SEND_QUEUE_AREA_HEIGHT}px`,
    );
  });

  it('marks the unsent state in words and with the violet accent, not the exclusion red', () => {
    render(
      <TimingSendQueue
        {...props({ entries: [entry()], unsentEntries: 1 })}
      />,
    );

    const state = within(rows()[0]).getByText('не отправлено');
    expect(state.closest('.ant-tag')).not.toBeNull();
    expect(colour(state.style.backgroundColor)).toBe(colour('#f9f0ff'));
    expect(colour(state.style.color)).toBe(colour('#391085'));
    expect(colour(state.style.borderColor)).not.toBe(colour('#cf1322'));
    expect(state.style.borderStyle).toBe('dashed');
  });
});
