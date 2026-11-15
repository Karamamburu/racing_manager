import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  ANONYMOUS_QUEUE_AREA_HEIGHT,
  AnonymousSplitQueue,
} from './AnonymousSplitQueue';
import type { TimingAnonymousSplitView } from './types';

/** A local-wall-clock instant, so the rendered `HH:mm:ss.SSS` is timezone-safe. */
function localIso(hours: number, minutes: number, seconds: number): string {
  return new Date(2026, 10, 13, hours, minutes, seconds, 0).toISOString();
}

function split(
  overrides: Partial<TimingAnonymousSplitView> = {},
): TimingAnonymousSplitView {
  const attemptLabel =
    overrides.attemptLabel ?? '5 км · Мужчины · Кубковая гонка — 10 км';
  const officialElapsedMs = overrides.officialElapsedMs ?? 60_000;
  return {
    splitId: 'split-1',
    attemptId: 'attempt-1',
    blockKey: 'start-a:1:M',
    attemptLabel,
    capturedAt: localIso(9, 1, 0),
    officialElapsedMs,
    status: 'QUEUED',
    bound: false,
    candidates: [
      {
        attemptId: 'attempt-1',
        blockKey: 'start-a:1:M',
        attemptLabel,
        officialElapsedMs,
      },
    ],
    captureDeviceSequence: 1,
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function queueArea(): HTMLElement {
  return screen.getByRole('list', { name: 'Очередь неприсвоенных отсечек' });
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

describe('AnonymousSplitQueue layout', () => {
  it('keeps the header, the count and the same fixed area while the queue is empty', () => {
    render(
      <AnonymousSplitQueue
        splits={[]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Неприсвоенные отсечки')).not.toBeNull();
    expect(screen.getByText('В очереди: 0')).not.toBeNull();
    expect(
      screen.getByText(
        'Очередь пуста: Enter или Space на пустом поле номера добавят отсечку',
      ),
    ).not.toBeNull();
    expect(queueArea().style.minHeight).toBe(
      `${ANONYMOUS_QUEUE_AREA_HEIGHT}px`,
    );
  });

  it('keeps the same fixed area when entries are added, so nothing around it moves', () => {
    const { rerender } = render(
      <AnonymousSplitQueue
        splits={[]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const emptyHeight = queueArea().style.minHeight;

    rerender(
      <AnonymousSplitQueue
        splits={[
          split(),
          split({ splitId: 'split-2', capturedAt: localIso(9, 2, 0) }),
          split({ splitId: 'split-3', capturedAt: localIso(9, 3, 0) }),
        ]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('В очереди: 3')).not.toBeNull();
    expect(queueArea().style.minHeight).toBe(emptyHeight);
    expect(queueArea().style.overflowY).toBe('auto');
  });
});

describe('AnonymousSplitQueue entries', () => {
  it('renders the entries oldest first with attempt, capture time and elapsed', () => {
    const { container } = render(
      <AnonymousSplitQueue
        splits={[
          split(),
          split({
            splitId: 'split-2',
            attemptLabel: '10 км · Женщины',
            capturedAt: localIso(9, 2, 30),
            officialElapsedMs: 90_500,
          }),
        ]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const first = screen.getByRole('button', {
      name: 'Отсечка 1: 5 км · Мужчины · Кубковая гонка — 10 км, отметка 09:01:00.000, прошло 01:00.000',
    });
    const second = screen.getByRole('button', {
      name: 'Отсечка 2: 10 км · Женщины, отметка 09:02:30.000, прошло 01:30.500',
    });

    const text = container.textContent ?? '';
    expect(text.indexOf('Отсечка 1')).toBeLessThan(text.indexOf('Отсечка 2'));
    expect(first.textContent).toContain('Отметка: 09:01:00.000');
    expect(second.textContent).toContain('прошло 01:30.500');
  });

  it('marks the selected entry and reports a selection to the page', () => {
    const onSelect = vi.fn();
    render(
      <AnonymousSplitQueue
        splits={[split(), split({ splitId: 'split-2' })]}
        selectedSplitId="split-2"
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    const entries = screen.getAllByRole('button', { name: /^Отсечка \d:/ });
    expect(entries).toHaveLength(2);
    expect(entries[0].getAttribute('aria-pressed')).toBe('false');
    expect(entries[1].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(entries[0]);
    expect(onSelect).toHaveBeenCalledWith('split-1');
  });

  it('offers no selection while the workstation cannot take an assignment', () => {
    render(
      <AnonymousSplitQueue
        splits={[split()]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        selectionDisabled
      />,
    );

    expect(
      (
        screen.getByRole('button', {
          name: /^Отсечка 1:/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe('AnonymousSplitQueue cancel', () => {
  it('requires a reason and cancels the entry with it', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    render(
      <AnonymousSplitQueue
        splits={[split()]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={onCancel}
        canCancel
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отменить отсечку 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отменить отсечку' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Укажите причину отмены отсечки',
    );

    fireEvent.change(screen.getByLabelText('Причина отмены отсечки'), {
      target: { value: 'Дубль нажатия' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить отсечку' }));

    await waitFor(() =>
      expect(onCancel).toHaveBeenCalledWith('split-1', 'Дубль нажатия'),
    );
    // A cancellation is sent once, with the reason the referee typed; the entry
    // leaves the queue with the refetch the page triggers (E-08).
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the reason and the entry when the cancellation is refused', async () => {
    const gate = deferred();
    const onCancel = vi.fn(() => gate.promise);
    render(
      <AnonymousSplitQueue
        splits={[split()]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={onCancel}
        canCancel
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отменить отсечку 1' }));
    fireEvent.change(screen.getByLabelText('Причина отмены отсечки'), {
      target: { value: 'Дубль нажатия' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить отсечку' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));

    gate.reject(new Error('Отсечка уже назначена другому участнику'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Отсечка уже назначена другому участнику',
      ),
    );
    expect(
      (screen.getByLabelText('Причина отмены отсечки') as HTMLTextAreaElement)
        .value,
    ).toBe('Дубль нажатия');
    expect(
      screen.getByRole('button', { name: /^Отсечка 1:/ }),
    ).not.toBeNull();
  });

  it('offers no cancel action to a user without the correction capability', () => {
    render(
      <AnonymousSplitQueue
        splits={[split()]}
        selectedSplitId={null}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Отменить отсечку/ })).toBeNull();
  });
});
