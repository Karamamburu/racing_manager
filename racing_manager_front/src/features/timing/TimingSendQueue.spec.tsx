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
  TIMING_SEND_QUEUE_FRAME_WIDTH,
  TimingSendQueue,
} from './TimingSendQueue';
import {
  TIMING_OFFLINE_ENTRY_KINDS,
  TIMING_OFFLINE_ENTRY_KIND_LABELS,
  type TimingOfflineEntryKind,
  type TimingOfflineEntryView,
} from './timingOffline';

/**
 * MANUAL-TIMING-6, Wave 2: the content of the on-demand unsent overlay.
 *
 * The overlay lists only entries the device recorded and the server has not
 * answered, and only the ones still waiting (FR-09, FR-11). A refusal is
 * reported once and removed by the hook, so it never becomes a row. A capture
 * whose delivery is in flight is a page figure — «Отправляется: K» — and never
 * a row (E-06, F-05).
 *
 * The frame never disappears and never resizes: the four figures, the
 * connection line, the row area and the action row are permanently rendered at
 * a fixed height, so opening the overlay, queueing a capture, starting its
 * delivery or draining the queue changes no geometry (S-05, S-07, F-08).
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
    isSending: status === 'SENT',
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

/** The same capture once the outbox holds an in-flight delivery for it (S-02). */
function sendingEntry(
  overrides: Partial<TimingOfflineEntryView> = {},
): TimingOfflineEntryView {
  return entry({ status: 'SENT', ...overrides });
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
    sendingEntries: 0,
    waitingEntries: 0,
    pendingMarks: 0,
    isOnline: true,
    isSending: false,
    onSendNow: vi.fn(() => Promise.resolve()),
    onClose: vi.fn(),
    ...overrides,
  };
}

/** The fixed-width overlay frame the page's popover owns. */
function frame(): HTMLElement {
  return screen.getByTestId('timing-send-queue-frame');
}

/** The permanently rendered figure block: two 16 px lines, never taller. */
function figures(): HTMLElement {
  return screen.getByTestId('timing-send-queue-figures');
}

/** The waiting-row area: one fixed height across every state (S-07). */
function queueArea(): HTMLElement {
  return screen.getByRole('list', { name: 'Очередь отправки' });
}

function rows(): HTMLElement[] {
  return within(queueArea()).queryAllByRole('listitem');
}

interface FigureText {
  unsent: number;
  sending: number;
  waiting: number;
  marks: number;
}

/** Asserts the two figure lines exactly, wording and order included (FR-24). */
function expectFigures({
  unsent,
  sending,
  waiting,
  marks,
}: FigureText): void {
  const lines = Array.from(figures().children);
  expect(lines).toHaveLength(2);
  expect(lines[0].textContent).toBe(
    `Не отправлено: ${unsent} · Отправляется: ${sending}`,
  );
  expect(lines[1].textContent).toBe(
    `Ожидают отправки: ${waiting} · из них отметок: ${marks}`,
  );
}

/** The frame and the row area keep one geometry whatever the rows do. */
function expectStableFrame(): void {
  expectOverlayWidth();
  expect(figures().style.height).toBe('34px');
  const area = queueArea();
  expect(area.tagName).toBe('UL');
  expect(screen.getByTestId('timing-send-queue-list-area')).toBe(area);
  expect(area.style.height).toBe('260px');
  expect(area.style.height).toBe(`${TIMING_SEND_QUEUE_AREA_HEIGHT}px`);
  expect(area.style.overflowY).toBe('auto');
}

/**
 * jsdom re-serialises the `calc()` arithmetic of the frame width, so the DOM
 * assertion states the two constraints the width combines (S-07).
 */
function expectOverlayWidth(): void {
  expect(TIMING_SEND_QUEUE_FRAME_WIDTH).toBe('min(480px, calc(100vw - 32px))');
  const width = frame().style.width;
  expect(width.startsWith('min(480px,')).toBe(true);
  expect(width).toContain('100vw');
  expect(width).toContain('-32px');
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

describe('TimingSendQueue frame', () => {
  it('keeps one frame and one fixed row area with nothing unsent', () => {
    render(<TimingSendQueue {...props()} />);

    expect(screen.getByText('Очередь отправки')).not.toBeNull();
    expect(frame()).not.toBeNull();
    expectStableFrame();
    expectFigures({ unsent: 0, sending: 0, waiting: 0, marks: 0 });
    expect(screen.getByText('Всё отправлено')).not.toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('keeps the frame while every unsent capture is in flight', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [sendingEntry({ id: 'sent-14' })],
          unsentEntries: 1,
          sendingEntries: 1,
          waitingEntries: 0,
        })}
      />,
    );

    // No card disappears and no row flashes for a capture already on its way
    // (S-05, F-05): the frame, its figures and its send action stay.
    expectStableFrame();
    expectFigures({ unsent: 1, sending: 1, waiting: 0, marks: 0 });
    expect(rows()).toHaveLength(0);
    expect(screen.queryByText('Всё отправлено')).toBeNull();
  });

  it('keeps the frame and the fixed row area with forty waiting rows', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      entry({ id: `entry-${index}`, startNumber: index + 1 }),
    );
    render(
      <TimingSendQueue
        {...props({
          entries: many,
          unsentEntries: 40,
          waitingEntries: 40,
          pendingMarks: 40,
        })}
      />,
    );

    // A long queue scrolls inside the same 260 px area, so the overlay never
    // grows on the page (S-07, F-08).
    expectStableFrame();
    expectFigures({ unsent: 40, sending: 0, waiting: 40, marks: 40 });
    expect(rows()).toHaveLength(40);
  });

  it('keeps the frame geometry identical across empty, in-flight and full states', () => {
    const { rerender } = render(<TimingSendQueue {...props()} />);
    const emptyWidth = frame().style.width;
    const emptyHeight = queueArea().style.height;
    expectStableFrame();

    rerender(
      <TimingSendQueue
        {...props({
          entries: [sendingEntry()],
          unsentEntries: 1,
          sendingEntries: 1,
        })}
      />,
    );
    expect(frame().style.width).toBe(emptyWidth);
    expect(queueArea().style.height).toBe(emptyHeight);
    expectStableFrame();

    rerender(
      <TimingSendQueue
        {...props({
          entries: [entry(), anonymousSplit()],
          unsentEntries: 2,
          waitingEntries: 2,
          pendingMarks: 1,
        })}
      />,
    );
    expect(frame().style.width).toBe(emptyWidth);
    expect(queueArea().style.height).toBe(emptyHeight);
    expectStableFrame();
  });

  it('closes the overlay from its own close control', () => {
    const onClose = vi.fn();
    render(<TimingSendQueue {...props({ onClose })} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Закрыть очередь отправки' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TimingSendQueue figures', () => {
  it('states the four page figures exactly', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [entry(), anonymousSplit()],
          unsentEntries: 5,
          sendingEntries: 2,
          waitingEntries: 3,
          pendingMarks: 2,
        })}
      />,
    );

    expectFigures({ unsent: 5, sending: 2, waiting: 3, marks: 2 });
  });

  it('states the sending figure while no waiting row exists', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [sendingEntry({ id: 'sent-14' }), sendingEntry({ id: 'sent-21' })],
          unsentEntries: 2,
          sendingEntries: 2,
          waitingEntries: 0,
        })}
      />,
    );

    // The page can read «Отправляется: 2» with «Ожидают отправки: 0» and no
    // row at all, and never reads «Всё отправлено» there (S-05, FR-26).
    expectFigures({ unsent: 2, sending: 2, waiting: 0, marks: 0 });
    expect(rows()).toHaveLength(0);
    expect(screen.queryByText('Всё отправлено')).toBeNull();
  });
});

describe('TimingSendQueue unsent entries', () => {
  it('lists the unsent entries with the count and sends them on demand', async () => {
    const onSendNow = vi.fn(() => Promise.resolve());
    render(
      <TimingSendQueue
        {...props({
          entries: [entry(), anonymousSplit()],
          unsentEntries: 2,
          waitingEntries: 2,
          pendingMarks: 1,
          onSendNow,
        })}
      />,
    );

    expect(screen.getByText('Очередь отправки')).not.toBeNull();
    expectFigures({ unsent: 2, sending: 0, waiting: 2, marks: 1 });
    expect(rows()).toHaveLength(2);

    // One press of «Отправить сейчас» asks the page to send the queue once
    // (S-07, FR-12); the pending-figure words never turn into a failure.
    fireEvent.click(screen.getByRole('button', { name: /Отправить сейчас/ }));
    await waitFor(() => expect(onSendNow).toHaveBeenCalledTimes(1));
  });

  it('keeps the send control busy and inert while a send is in flight', async () => {
    const onSendNow = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
          isSending: true,
        })}
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
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
          onSendNow,
        })}
      />,
    );
    const ready = screen.getByRole('button', {
      name: /Отправить сейчас/,
    }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    await waitFor(() => expect(onSendNow).toHaveBeenCalledTimes(1));
  });

  it('offers the send action while an unsent capture is in flight', () => {
    const onSendNow = vi.fn(() => Promise.resolve());
    render(
      <TimingSendQueue
        {...props({
          entries: [sendingEntry()],
          unsentEntries: 1,
          sendingEntries: 1,
          onSendNow,
        })}
      />,
    );

    // Every unsent capture is already on its way, so no row and no
    // everything-sent statement, but the action stays available (S-05).
    expect(rows()).toHaveLength(0);
    expect(screen.queryByText('Всё отправлено')).toBeNull();
    const send = screen.getByRole('button', {
      name: /Отправить сейчас/,
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSendNow).toHaveBeenCalledTimes(1);
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
    // The zero figure is still stated, never hidden (FR-25).
    expectFigures({ unsent: 0, sending: 0, waiting: 0, marks: 0 });
    // An empty queue is a quiet fact, never an error state.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.ant-alert')).toBeNull();
  });

  it('says everything is sent only when nothing is unsent', () => {
    const { rerender } = render(<TimingSendQueue {...props()} />);
    expect(screen.getByText('Всё отправлено')).not.toBeNull();

    rerender(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
      />,
    );
    expect(screen.queryByText('Всё отправлено')).toBeNull();

    rerender(
      <TimingSendQueue
        {...props({
          entries: [sendingEntry()],
          unsentEntries: 1,
          sendingEntries: 1,
        })}
      />,
    );
    expect(screen.queryByText('Всё отправлено')).toBeNull();
  });

  it('states the lost connection while entries wait, without an error state', () => {
    const { rerender } = render(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
          isOnline: false,
        })}
      />,
    );

    expect(screen.getByText('Нет связи с сервером')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.ant-alert')).toBeNull();
    // The rows and the figures stay visible while the connection is gone
    // (S-04, FR-11).
    expectFigures({ unsent: 1, sending: 0, waiting: 1, marks: 1 });
    expect(rows()).toHaveLength(1);
    expectStableFrame();

    rerender(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
      />,
    );
    expect(screen.queryByText('Нет связи с сервером')).toBeNull();

    // The hint belongs to the unsent report and disappears with a resolved
    // queue (UC-04); «Всё отправлено» stays the only message.
    rerender(<TimingSendQueue {...props({ isOnline: false })} />);
    expect(screen.queryByText('Нет связи с сервером')).toBeNull();
    expect(screen.getByText('Всё отправлено')).not.toBeNull();
  });

  it('reserves the connection line so its appearance moves nothing', () => {
    const { rerender } = render(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
      />,
    );

    // The line is rendered whether or not it carries the hint, at one height.
    const offlineLine = screen
      .getByText('Очередь отправки')
      .closest('.ant-card')
      ?.querySelector('[data-testid="timing-send-queue-figures"]')
      ?.nextElementSibling as HTMLElement;
    expect(offlineLine.style.height).toBe('18px');
    expect(offlineLine.textContent).toBe('');
    expectStableFrame();

    rerender(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
          isOnline: false,
        })}
      />,
    );
    const offlineAgain = screen
      .getByText('Очередь отправки')
      .closest('.ant-card')
      ?.querySelector('[data-testid="timing-send-queue-figures"]')
      ?.nextElementSibling as HTMLElement;
    expect(offlineAgain).toBe(offlineLine);
    expect(offlineAgain.style.height).toBe('18px');
    expect(offlineAgain.textContent).toBe('Нет связи с сервером');
    expectStableFrame();

    // Without waiting rows the line goes quiet again at the same height.
    rerender(
      <TimingSendQueue
        {...props({
          entries: [sendingEntry()],
          unsentEntries: 1,
          sendingEntries: 1,
          isOnline: false,
        })}
      />,
    );
    expect(offlineAgain.textContent).toBe('');
    expect(offlineAgain.style.height).toBe('18px');
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
          waitingEntries: 3,
          pendingMarks: 2,
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
          waitingEntries: kinds.length,
          pendingMarks: kinds.length,
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
          waitingEntries: 1,
        })}
      />,
    );

    const row = rows()[0];
    expect(row.textContent).toContain('Отмена отметки');
    expect(row.textContent).toContain('Отменяет отметку: № 14 Иванов Иван');
    expect(within(row).getByText('не отправлено')).not.toBeNull();
  });
});

describe('TimingSendQueue waiting rows only', () => {
  it('renders one row for a waiting capture and no row for the same capture on its way', () => {
    const waiting = entry({ id: 'capture-14' });
    const { rerender } = render(
      <TimingSendQueue
        {...props({
          entries: [waiting],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
      />,
    );

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Отметка по номеру');
    expect(rows()[0].textContent).toContain('№ 14');
    expect(rows()[0].textContent).toContain('Отметка: 09:01:00.250');

    // The same capture, now with its delivery in flight: a figure in the
    // frame, never a row the referee must manage (S-05, E-06, F-05).
    rerender(
      <TimingSendQueue
        {...props({
          entries: [{ ...waiting, status: 'SENT', isSending: true }],
          unsentEntries: 1,
          sendingEntries: 1,
          waitingEntries: 0,
        })}
      />,
    );

    expect(rows()).toHaveLength(0);
    expect(screen.queryByText('Всё отправлено')).toBeNull();
    expectFigures({ unsent: 1, sending: 1, waiting: 0, marks: 0 });
    expectStableFrame();
    // The frame survives the drain, so the overlay keeps its position (E-06).
    expect(frame()).not.toBeNull();
  });

  it('lists only the waiting captures of a mixed queue, in capture order', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [
            sendingEntry({
              id: 'sent-14',
              startNumber: 14,
              fullName: 'Иванов Иван',
              pressTime: localIso(9, 1, 0, 100),
            }),
            entry({
              id: 'wait-21',
              startNumber: 21,
              fullName: 'Сидорова Анна',
              pressTime: localIso(9, 1, 1, 200),
            }),
            sendingEntry({
              id: 'sent-30',
              startNumber: 30,
              fullName: 'Петров Пётр',
              pressTime: localIso(9, 1, 2, 300),
            }),
            entry({
              id: 'wait-44',
              startNumber: 44,
              fullName: 'Кузнецов Лев',
              pressTime: localIso(9, 1, 3, 400),
            }),
          ],
          unsentEntries: 4,
          sendingEntries: 2,
          waitingEntries: 2,
          pendingMarks: 2,
        })}
      />,
    );

    const rendered = rows();
    expect(rendered).toHaveLength(2);
    expect(rendered[0].textContent).toContain('№ 21');
    expect(rendered[0].textContent).toContain('Сидорова Анна');
    expect(rendered[0].textContent).toContain('Отметка: 09:01:01.200');
    expect(rendered[1].textContent).toContain('№ 44');
    expect(rendered[1].textContent).toContain('Кузнецов Лев');
    expect(rendered[1].textContent).toContain('Отметка: 09:01:03.400');
    expect(screen.queryByText('№ 14')).toBeNull();
    expect(screen.queryByText('№ 30')).toBeNull();

    // The figures still count every unsent entry, sending or waiting, so the
    // overlay and the page totals can never disagree (S-01, S-05).
    expectFigures({ unsent: 4, sending: 2, waiting: 2, marks: 2 });
  });

  it('lists a waiting withdrawal without its sending capture and still names that capture', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [
            sendingEntry({ id: 'entry-1' }),
            entry({
              id: 'entry-undo',
              kind: 'UNDO',
              operation: 'UNDO',
              pendingMarks: 0,
              pairId: 'entry-1',
              pairRole: 'WITHDRAWAL',
              withdraws: {
                entryId: 'entry-1',
                startNumber: 14,
                fullName: 'Иванов Иван',
                blockKey: 'block-a',
                confirmed: false,
              },
            }),
          ],
          unsentEntries: 2,
          sendingEntries: 1,
          waitingEntries: 1,
        })}
      />,
    );

    // The capture is on its way, so only its withdrawal waits; the withdrawal
    // still names the capture it retires (FR-39, E-06).
    expect(screen.queryByText('Отметка по номеру')).toBeNull();
    const rendered = rows();
    expect(rendered).toHaveLength(1);
    expect(rendered[0].textContent).toContain('Отмена отметки');
    expect(rendered[0].textContent).toContain(
      'Отменяет отметку: № 14 Иванов Иван',
    );
    expect(within(rendered[0]).getByText('не отправлено')).not.toBeNull();
    expectFigures({ unsent: 2, sending: 1, waiting: 1, marks: 0 });
  });

  it('keeps the row area unchanged when every unsent capture is on its way', () => {
    const waiting = entry();
    const sending = sendingEntry({ id: 'entry-2', startNumber: 21 });
    const { rerender } = render(
      <TimingSendQueue
        {...props({
          entries: [waiting, sending],
          unsentEntries: 2,
          sendingEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
      />,
    );

    // The area that holds the waiting rows keeps its exact height and the
    // scrolling the overlay asserts, whatever else is sending (S-07).
    expectStableFrame();
    expect(rows()).toHaveLength(1);

    rerender(
      <TimingSendQueue
        {...props({
          entries: [sending],
          unsentEntries: 1,
          sendingEntries: 1,
        })}
      />,
    );
    // Every unsent capture is on its way: no row, but the frame and its row
    // area stay exactly where they were (S-05, E-06).
    expect(rows()).toHaveLength(0);
    expectStableFrame();
    expectFigures({ unsent: 1, sending: 1, waiting: 0, marks: 0 });

    // The area returns with the same geometry when a capture waits again.
    rerender(
      <TimingSendQueue
        {...props({
          entries: [waiting],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
      />,
    );
    expectStableFrame();
    expect(rows()).toHaveLength(1);
    expectFigures({ unsent: 1, sending: 0, waiting: 1, marks: 1 });
  });
});

describe('TimingSendQueue layout', () => {
  it('keeps the entry area stable and scrollable across states', () => {
    const { rerender } = render(<TimingSendQueue {...props()} />);

    expectStableFrame();
    const emptyHeight = queueArea().style.height;
    expect(emptyHeight).toBe('260px');

    rerender(
      <TimingSendQueue
        {...props({
          entries: [entry(), anonymousSplit()],
          unsentEntries: 2,
          waitingEntries: 2,
          pendingMarks: 1,
        })}
      />,
    );

    // A growing queue scrolls inside the same area, so nothing behind the
    // overlay moves (S-07, F-08).
    expect(queueArea().style.height).toBe(emptyHeight);
    expect(queueArea().style.overflowY).toBe('auto');
    expectStableFrame();
  });

  it('marks the unsent state in words and with the violet accent, not the exclusion red', () => {
    render(
      <TimingSendQueue
        {...props({
          entries: [entry()],
          unsentEntries: 1,
          waitingEntries: 1,
          pendingMarks: 1,
        })}
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
