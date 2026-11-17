import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { PendingFinishBar } from './PendingFinishBar';
import type { TimingPassView } from './types';

/** A local-wall-clock instant, so the rendered `HH:mm:ss.SSS` is timezone-safe. */
function localIso(hours: number, minutes: number, seconds: number): string {
  return new Date(2026, 10, 13, hours, minutes, seconds, 0).toISOString();
}

function pendingFinish(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-1',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: localIso(9, 1, 0),
    officialAt: localIso(9, 1, 0),
    officialElapsedMs: 60_000,
    status: 'PENDING',
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(cleanup);

describe('PendingFinishBar', () => {
  it('renders every pending finish with its captured time', () => {
    render(
      <PendingFinishBar
        pending={[
          pendingFinish(),
          pendingFinish({
            passId: 'pass-2',
            rawCapturedAt: localIso(9, 2, 30),
          }),
        ]}
        onBind={vi.fn()}
      />,
    );

    expect(screen.getByText('Финиш 09:01:00.000')).not.toBeNull();
    expect(screen.getByText('Финиш 09:02:30.000')).not.toBeNull();
    expect(
      screen.getByLabelText('Номер участника для финиша 09:01:00.000'),
    ).not.toBeNull();
  });

  it('binds a pending finish with the typed number', async () => {
    const onBind = vi.fn().mockResolvedValue(undefined);
    render(<PendingFinishBar pending={[pendingFinish()]} onBind={onBind} />);

    fireEvent.change(
      screen.getByLabelText('Номер участника для финиша 09:01:00.000'),
      { target: { value: '42' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Привязать финиш 09:01:00.000' }),
    );

    await waitFor(() => expect(onBind).toHaveBeenCalledWith('pass-1', 42));
    await waitFor(() =>
      expect(
        (
          screen.getByLabelText(
            'Номер участника для финиша 09:01:00.000',
          ) as HTMLInputElement
        ).value,
      ).toBe(''),
    );
  });

  it('shows the empty state when no finish is pending', () => {
    render(<PendingFinishBar pending={[]} onBind={vi.fn()} />);
    expect(screen.getByText('Нет непривязанных финишей')).not.toBeNull();
  });

  it('offers cancel only when the parent supplies it', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <PendingFinishBar pending={[pendingFinish()]} onBind={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Отменить/ })).toBeNull();

    rerender(
      <PendingFinishBar
        pending={[pendingFinish()]}
        onBind={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Отменить финиш 09:01:00.000' }),
    );
    expect(onCancel).toHaveBeenCalledWith('pass-1');
  });

  it('refuses an empty or non-positive number without binding', () => {
    const onBind = vi.fn();
    render(<PendingFinishBar pending={[pendingFinish()]} onBind={onBind} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Привязать финиш 09:01:00.000' }),
    );
    expect(onBind).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника больше нуля',
    );

    fireEvent.change(
      screen.getByLabelText('Номер участника для финиша 09:01:00.000'),
      { target: { value: '0' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Привязать финиш 09:01:00.000' }),
    );
    expect(onBind).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника больше нуля',
    );
  });

  it('keeps the row and the typed number when the bind is refused', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onBind = vi.fn().mockRejectedValue(
      new Error('У участника уже собраны все круги'),
    );
    render(<PendingFinishBar pending={[pendingFinish()]} onBind={onBind} />);

    const input = screen.getByLabelText(
      'Номер участника для финиша 09:01:00.000',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Привязать финиш 09:01:00.000' }),
    );

    await waitFor(() => expect(onBind).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByText('Финиш 09:01:00.000')).not.toBeNull();
    expect(input.value).toBe('42');
    expect(
      (
        screen.getByRole('button', {
          name: 'Привязать финиш 09:01:00.000',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('shows a busy row and leaves the other rows usable', async () => {
    const gate = deferred();
    const onBind = vi.fn(() => gate.promise);
    render(
      <PendingFinishBar
        pending={[
          pendingFinish(),
          pendingFinish({ passId: 'pass-2', rawCapturedAt: localIso(9, 2, 30) }),
        ]}
        onBind={onBind}
      />,
    );

    fireEvent.change(
      screen.getByLabelText('Номер участника для финиша 09:01:00.000'),
      { target: { value: '42' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Привязать финиш 09:01:00.000' }),
    );

    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Привязать финиш 09:01:00.000',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Привязать финиш 09:02:30.000',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    gate.resolve();
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Привязать финиш 09:01:00.000',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
});
