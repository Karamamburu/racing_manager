import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  NumberCaptureField,
  type NumberCaptureCandidate,
} from './NumberCaptureField';
import type { TimingCaptureOutcomeEvent } from './types';
import type { TimingCaptureOutcome } from './useTimingCapture';

function candidate(
  overrides: Partial<NumberCaptureCandidate> = {},
): NumberCaptureCandidate {
  return {
    enrollmentId: 'enrollment-1',
    attemptId: 'attempt-1',
    label: '17 · 5 км · Иван Петров',
    ...overrides,
  };
}

/** A commit whose answer the test decides, so the pending state is observable. */
function deferredOutcome() {
  let resolve!: (outcome: TimingCaptureOutcome) => void;
  const promise = new Promise<TimingCaptureOutcome>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

/** One answer of the page's outcome feed (AD-7). */
function outcomeEvent(
  overrides: Partial<TimingCaptureOutcomeEvent> = {},
): TimingCaptureOutcomeEvent {
  return {
    id: 'capture-1',
    subject: '№ 17',
    tone: 'confirmed',
    at: new Date().toISOString(),
    ...overrides,
  };
}

function numberInput(): HTMLInputElement {
  return screen.getByLabelText('Номер участника') as HTMLInputElement;
}

/** The outcome line the field shows after a press; never a validation alert. */
function statusText(): string {
  return screen.getByRole('status').textContent ?? '';
}

/** The press region of the fixed-height slot: the newest press only. */
function pressRegion(): HTMLElement {
  return screen.getByTestId('timing-field-press');
}

function pressNumber(value: string) {
  fireEvent.change(numberInput(), { target: { value } });
  fireEvent.keyDown(numberInput(), { key: 'Enter' });
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NumberCaptureField', () => {
  it('commits a typed number with Enter and clears the field at the press', async () => {
    const gate = deferredOutcome();
    const onCommit = vi.fn(() => gate.promise);
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith({
      startNumber: 17,
      enrollmentId: 'enrollment-1',
      capturedAt: expect.any(String),
      monotonicMs: expect.any(Number),
    });

    // Accepted at the press: empty and focused before the page answers.
    expect(numberInput().value).toBe('');
    expect(document.activeElement).toBe(numberInput());
    expect(pressRegion().textContent).toContain('№ 17');
    expect(screen.queryByText('Отправляем отметку…')).toBeNull();
    expect(screen.queryByText('Отправляем отсечку…')).toBeNull();
    expect(screen.queryByText('Назначаем отсечку…')).toBeNull();

    gate.resolve({ status: 'CONFIRMED' });
    await waitFor(() =>
      expect(statusText()).toBe('№ 17 — сервер подтвердил отметку'),
    );
    expect(numberInput().value).toBe('');
  });

  it('keeps one fixed feedback slot across idle, accepted, answered and refused states', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    const confirmed = outcomeEvent({ id: 'capture-21', subject: '№ 21' });
    const refused = outcomeEvent({
      id: 'capture-17',
      subject: '№ 17',
      tone: 'refused',
      reason: 'Попытка уже закрыта',
    });
    const { rerender } = render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    const slot = screen.getByTestId('timing-field-feedback');
    expect(slot.style.height).toBe('44px');
    expect(slot.style.overflowY).toBe('auto');

    pressNumber('17');
    await waitFor(() => expect(pressRegion().textContent).toContain('принято'));
    expect(slot.style.height).toBe('44px');

    pressNumber('21');
    await waitFor(() => expect(pressRegion().textContent).toContain('№ 21'));
    expect(slot.style.height).toBe('44px');

    rerender(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[confirmed]}
      />,
    );
    await waitFor(() =>
      expect(statusText()).toBe('№ 21 — сервер подтвердил отметку'),
    );
    expect(slot.style.height).toBe('44px');

    rerender(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[confirmed, refused]}
      />,
    );
    await waitFor(() =>
      expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта'),
    );

    // The same wrapper, at the same height, whatever the slot states.
    expect(screen.getByTestId('timing-field-feedback')).toBe(slot);
    expect(slot.style.height).toBe('44px');
  });

  it('commits with Space, which never becomes part of the number', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: ' ' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ startNumber: 17, enrollmentId: 'enrollment-1' }),
    );
    expect(numberInput().value).toBe('');
  });

  it('refuses an empty or non-numeric value with a visible message', () => {
    const onCommit = vi.fn();
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника цифрами',
    );

    fireEvent.change(numberInput(), { target: { value: '1a7' } });
    expect(numberInput().value).toBe('17');
    fireEvent.change(numberInput(), { target: { value: 'abc' } });
    expect(numberInput().value).toBe('');
    fireEvent.change(numberInput(), { target: { value: '0' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Номер участника должен быть больше нуля',
    );
  });

  it('keeps the typed text and shows the message when nothing resolves', () => {
    const onCommit = vi.fn();
    const onError = vi.fn();
    const resolve = vi.fn(() => []);
    render(
      <NumberCaptureField
        resolve={resolve}
        onCommit={onCommit}
        onError={onError}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '99' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    expect(resolve).toHaveBeenCalledWith(99);
    expect(onCommit).not.toHaveBeenCalled();
    expect(numberInput().value).toBe('99');
    expect(screen.getByRole('alert').textContent).toBe(
      'Участник с номером 99 не найден среди идущих заездов',
    );
    expect(onError).toHaveBeenCalledWith(
      'Участник с номером 99 не найден среди идущих заездов',
    );
  });

  it('opens the picker for an ambiguous number and keeps the original instant', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T09:00:00.000Z'));
    let monotonicNow = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);

    const onCommit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField
        resolve={() => [
          candidate(),
          candidate({ enrollmentId: 'enrollment-2', label: '17 · 10 км · Борис' }),
        ]}
        onCommit={onCommit}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: '17 · 5 км · Иван Петров' }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole('button', { name: '17 · 10 км · Борис' }),
    ).not.toBeNull();

    monotonicNow = 5000;
    vi.setSystemTime(new Date('2026-11-13T09:00:05.000Z'));
    fireEvent.click(
      within(dialog).getByRole('button', { name: '17 · 5 км · Иван Петров' }),
    );

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith({
      startNumber: 17,
      enrollmentId: 'enrollment-1',
      capturedAt: '2026-11-13T09:00:00.000Z',
      monotonicMs: 1000,
    });
    await waitFor(() => expect(numberInput().value).toBe(''));
  });

  it('accepts a press while an earlier commit is still unresolved', async () => {
    const gate = deferredOutcome();
    const onCommit = vi.fn(() => gate.promise);
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    pressNumber('17');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));

    // The first delivery is still open, yet the field is free and silent.
    expect(numberInput().value).toBe('');
    expect(document.activeElement).toBe(numberInput());
    expect(screen.queryByText('Отправляем отметку…')).toBeNull();

    // The next press is accepted in the same tick, before any answer.
    pressNumber('21');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ startNumber: 21 }),
    );
    expect(numberInput().value).toBe('');
    expect(document.activeElement).toBe(numberInput());
    expect(screen.queryByText('Отправляем отметку…')).toBeNull();
    expect(pressRegion().textContent).toContain('№ 21');
  });

  it('does not commit twice for one press when the key repeats on the emptied field', async () => {
    const gate = deferredOutcome();
    const onCommit = vi.fn(() => gate.promise);
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    // The repeated key met an empty field, so it created no second capture.
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника цифрами',
    );

    gate.resolve({ status: 'CONFIRMED' });
    await waitFor(() =>
      expect(statusText()).toBe('№ 17 — сервер подтвердил отметку'),
    );
  });

  it('does nothing while disabled', () => {
    const onCommit = vi.fn();
    render(
      <NumberCaptureField
        disabled
        resolve={() => [candidate()]}
        onCommit={onCommit}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('records an anonymous split when Enter is pressed on the empty field', async () => {
    const onAnonymousSplit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    const onCommit = vi.fn();
    render(
      <NumberCaptureField
        resolve={() => []}
        onCommit={onCommit}
        onAnonymousSplit={onAnonymousSplit}
      />,
    );

    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(onAnonymousSplit).toHaveBeenCalledTimes(1));
    expect(onCommit).not.toHaveBeenCalled();
    expect(numberInput().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('records an anonymous split when Space is pressed on the empty field', async () => {
    const onAnonymousSplit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    const onCommit = vi.fn();
    render(
      <NumberCaptureField
        resolve={() => []}
        onCommit={onCommit}
        onAnonymousSplit={onAnonymousSplit}
      />,
    );

    fireEvent.keyDown(numberInput(), { key: ' ' });

    await waitFor(() => expect(onAnonymousSplit).toHaveBeenCalledTimes(1));
    expect(onCommit).not.toHaveBeenCalled();
    expect(numberInput().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('commits a typed number with Space like Enter', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: ' ' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ startNumber: 17 }),
    );
    await waitFor(() => expect(numberInput().value).toBe(''));
  });

  it('opens assignment mode with the field focused and no extra prompt', () => {
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={vi.fn()}
        assignment={{
          splitId: 'split-1',
          attemptLabel: '5 км · Мужчины · Кубковая гонка — 10 км',
        }}
        onAssign={vi.fn()}
      />,
    );

    expect(screen.getByText('Номер участника')).not.toBeNull();
    expect(
      screen.queryByText(/Отсечка будет назначена попытке/),
    ).toBeNull();
    expect(numberInput().placeholder).toBe('№');
    expect(numberInput().style.width).toBe('264px');
    expect(numberInput().style.height).toBe('264px');
    expect(numberInput().style.fontSize).toBe('96px');
    expect(document.activeElement).toBe(numberInput());
  });

  it('assigns a typed number in assignment mode without resolving a capture', async () => {
    const resolve = vi.fn(() => []);
    const onAssign = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    const onCommit = vi.fn();
    render(
      <NumberCaptureField
        resolve={resolve}
        onCommit={onCommit}
        assignment={{ splitId: 'split-1', attemptLabel: '5 км · Мужчины' }}
        onAssign={onAssign}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '42' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(42));
    expect(resolve).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    await waitFor(() => expect(numberInput().value).toBe(''));
  });

  it('refuses an empty assignment in either commit key and creates nothing', async () => {
    const onAssign = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={vi.fn()}
        assignment={{ splitId: 'split-1', attemptLabel: '5 км · Мужчины' }}
        onAssign={onAssign}
      />,
    );

    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onAssign).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника для назначения отсечки',
    );

    fireEvent.keyDown(numberInput(), { key: ' ' });
    await waitFor(() => expect(onAssign).not.toHaveBeenCalled());
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника для назначения отсечки',
    );
  });

  it('returns to the empty field when assignment mode ends', () => {
    const { rerender } = render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={vi.fn()}
        assignment={{ splitId: 'split-1', attemptLabel: '5 км · Мужчины' }}
        onAssign={vi.fn()}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '42' } });
    expect(numberInput().value).toBe('42');

    rerender(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={vi.fn()} />,
    );

    expect(screen.getByText('Номер участника')).not.toBeNull();
    expect(numberInput().value).toBe('');
  });

  it('clears the field at the press, keeps focus and names the number on a confirmed capture', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    pressNumber('17');

    await waitFor(() =>
      expect(statusText()).toBe('№ 17 — сервер подтвердил отметку'),
    );
    expect(numberInput().value).toBe('');
    expect(document.activeElement).toBe(numberInput());
    expect(pressRegion().textContent).toContain('№ 17');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('states the newest press as accepted and does not claim confirmation', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    pressNumber('17');

    await waitFor(() =>
      expect(pressRegion().textContent).toContain('№ 17'),
    );
    expect(pressRegion().textContent).toContain('принято');
    expect(pressRegion().textContent).toContain('ожидает подтверждения');
    expect(pressRegion().textContent).not.toContain('сервер подтвердил');
    // No answer has arrived, so the outcome region states nothing.
    expect(screen.queryByRole('status')).toBeNull();
    expect(numberInput().value).toBe('');
    expect(document.activeElement).toBe(numberInput());
  });

  it('does not let a confirmed outcome for an earlier press replace the newer press statement', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    const confirmedEarlier = outcomeEvent({
      id: 'capture-17',
      subject: '№ 17',
      tone: 'confirmed',
    });
    const { rerender } = render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    pressNumber('17');
    pressNumber('21');
    await waitFor(() => expect(pressRegion().textContent).toContain('№ 21'));

    rerender(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[confirmedEarlier]}
      />,
    );

    await waitFor(() =>
      expect(statusText()).toBe('№ 17 — сервер подтвердил отметку'),
    );
    expect(pressRegion().textContent).toContain('№ 21');
    expect(pressRegion().textContent).toContain('принято');
    expect(pressRegion().textContent).not.toContain('№ 17');
  });

  it('keeps a refused outcome visible through later presses and a later confirmation', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    const refused = outcomeEvent({
      id: 'capture-17',
      subject: '№ 17',
      tone: 'refused',
      reason: 'Попытка уже закрыта',
    });
    const confirmed = outcomeEvent({
      id: 'capture-21',
      subject: '№ 21',
      tone: 'confirmed',
    });
    const { rerender } = render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[refused]}
      />,
    );

    await waitFor(() =>
      expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта'),
    );
    expect(screen.getByText('Не закрыто отказов: 1')).not.toBeNull();

    pressNumber('31');
    pressNumber('32');
    pressNumber('33');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(3));
    expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта');

    rerender(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[refused, confirmed]}
      />,
    );

    await waitFor(() =>
      expect(pressRegion().textContent).toContain('№ 33'),
    );
    expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта');
    expect(screen.getByText('Не закрыто отказов: 1')).not.toBeNull();
  });

  it('dismisses the visible refusal without touching the typed text or a count', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    const refused = outcomeEvent({
      id: 'capture-17',
      subject: '№ 17',
      tone: 'refused',
      reason: 'Попытка уже закрыта',
    });
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[refused]}
        pendingCount={4}
      />,
    );

    await waitFor(() =>
      expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта'),
    );

    pressNumber('21');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    // A number typed after the refusal is never taken away by it.
    fireEvent.change(numberInput(), { target: { value: '42' } });
    const commitsBeforeDismissal = onCommit.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть отказ' }));

    expect(numberInput().value).toBe('42');
    expect(numberInput().value).not.toBe('17');
    expect(screen.queryByRole('button', { name: 'Скрыть отказ' })).toBeNull();
    expect(screen.queryByText(/Не закрыто отказов/)).toBeNull();
    expect(onCommit).toHaveBeenCalledTimes(commitsBeforeDismissal);
    expect(pressRegion().textContent).toContain('№ 21');
  });

  it('adds a second refusal to the count instead of replacing the visible one', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'ACCEPTED' });
    const first = outcomeEvent({
      id: 'capture-17',
      subject: '№ 17',
      tone: 'refused',
      reason: 'Попытка уже закрыта',
    });
    const second = outcomeEvent({
      id: 'capture-21',
      subject: '№ 21',
      tone: 'refused',
      reason: 'Нет такой попытки',
    });
    const { rerender } = render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[first]}
      />,
    );

    await waitFor(() =>
      expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта'),
    );

    rerender(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        outcomes={[first, second]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Не закрыто отказов: 2')).not.toBeNull(),
    );
    // The visible refusal is the oldest one, never silently replaced.
    expect(statusText()).toBe('Отклонено: № 17 — Попытка уже закрыта');

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть отказ' }));
    expect(statusText()).toBe('Отклонено: № 21 — Нет такой попытки');
    expect(screen.getByText('Не закрыто отказов: 1')).not.toBeNull();
  });

  it('clears the field on an unsent capture and reports it as unsent, not as a failure', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'UNSENT' });
    const onError = vi.fn();
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        pendingCount={2}
        onError={onError}
      />,
    );

    pressNumber('17');

    await waitFor(() =>
      expect(statusText()).toBe(
        '№ 17 — отметка сохранена на устройстве, не отправлено: 2',
      ),
    );
    expect(numberInput().value).toBe('');
    expect(document.activeElement).toBe(numberInput());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('follows the pendingCount prop in the unsent status', async () => {
    const onCommit = vi.fn().mockResolvedValue({ status: 'UNSENT' });
    const { rerender } = render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        pendingCount={0}
      />,
    );

    pressNumber('17');

    await waitFor(() => expect(statusText()).toContain('не отправлено: 0'));

    rerender(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        pendingCount={4}
      />,
    );

    expect(statusText()).toBe(
      '№ 17 — отметка сохранена на устройстве, не отправлено: 4',
    );
  });

  it('keeps the text typed since the press and shows the server reason on a refusal', async () => {
    const gate = deferredOutcome();
    const onCommit = vi.fn(() => gate.promise);
    const onError = vi.fn();
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        onError={onError}
      />,
    );

    pressNumber('17');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));

    // The referee starts the next number while the first press is unanswered.
    fireEvent.change(numberInput(), { target: { value: '21' } });

    gate.resolve({ status: 'REJECTED', reason: 'Попытка уже закрыта' });
    await waitFor(() =>
      expect(statusText()).toBe(
        'Отклонено: № 17 — Попытка уже закрыта',
      ),
    );

    // The refused number is never written back over the current text.
    expect(numberInput().value).toBe('21');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not repopulate an emptied field with the refused number', async () => {
    const gate = deferredOutcome();
    const onCommit = vi.fn(() => gate.promise);
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    pressNumber('17');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));

    fireEvent.change(numberInput(), { target: { value: '' } });
    gate.resolve({ status: 'REJECTED', reason: 'Нет такой попытки' });

    await waitFor(() =>
      expect(statusText()).toBe('Отклонено: № 17 — Нет такой попытки'),
    );
    expect(numberInput().value).toBe('');
  });

  it('refuses invalid input locally and creates no press statement', () => {
    const onCommit = vi.fn();
    render(<NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />);

    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника цифрами',
    );
    expect(pressRegion().textContent).not.toContain('принято');
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.change(numberInput(), { target: { value: '0' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(numberInput().value).toBe('0');
    expect(pressRegion().textContent).not.toContain('принято');
  });

  it('keeps the typed text and shows no outcome line on a local refusal', () => {
    const onCommit = vi.fn();
    render(
      <NumberCaptureField resolve={() => []} onCommit={onCommit} />,
    );

    fireEvent.change(numberInput(), { target: { value: '99' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    expect(numberInput().value).toBe('99');
    expect(screen.getByRole('alert').textContent).toBe(
      'Участник с номером 99 не найден среди идущих заездов',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the old empty-field refusal when the page offers no anonymous route', () => {
    const onCommit = vi.fn();
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника цифрами',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a typed number is a capture, never an anonymous split', async () => {
    const onAnonymousSplit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    const onCommit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        onAnonymousSplit={onAnonymousSplit}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onAnonymousSplit).not.toHaveBeenCalled();
  });

  it('clears an empty field after a confirmed anonymous split and states why it has no number', async () => {
    const onAnonymousSplit = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField
        resolve={() => []}
        onCommit={vi.fn()}
        onAnonymousSplit={onAnonymousSplit}
        pendingCount={1}
      />,
    );

    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() =>
      expect(statusText()).toBe(
        'Отсечка без номера — сервер подтвердил отметку',
      ),
    );
    expect(numberInput().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports an unsent anonymous split with the pending total and no error', async () => {
    const onAnonymousSplit = vi.fn().mockResolvedValue({ status: 'UNSENT' });
    const onError = vi.fn();
    render(
      <NumberCaptureField
        resolve={() => []}
        onCommit={vi.fn()}
        onAnonymousSplit={onAnonymousSplit}
        pendingCount={3}
        onError={onError}
      />,
    );

    fireEvent.keyDown(numberInput(), { key: ' ' });

    await waitFor(() =>
      expect(statusText()).toBe(
        'Отсечка без номера — отметка сохранена на устройстве, не отправлено: 3',
      ),
    );
    expect(numberInput().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('clears the field on a confirmed assignment and names the number', async () => {
    const onAssign = vi.fn().mockResolvedValue({ status: 'CONFIRMED' });
    render(
      <NumberCaptureField
        resolve={() => []}
        onCommit={vi.fn()}
        assignment={{ splitId: 'split-1', attemptLabel: '5 км · Мужчины' }}
        onAssign={onAssign}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '42' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(numberInput().value).toBe(''));
    await waitFor(() =>
      expect(statusText()).toBe('№ 42 — сервер подтвердил отметку'),
    );
    expect(pressRegion().textContent).toContain('№ 42');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears an unsent assignment and does not offer the split a second time', async () => {
    const onAssign = vi.fn().mockResolvedValue({ status: 'UNSENT' });
    const onCommit = vi.fn();
    render(
      <NumberCaptureField
        resolve={() => [candidate()]}
        onCommit={onCommit}
        assignment={{ splitId: 'split-1', attemptLabel: '5 км · Мужчины' }}
        onAssign={onAssign}
        pendingCount={2}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '42' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() =>
      expect(statusText()).toBe(
        '№ 42 — отметка сохранена на устройстве, не отправлено: 2',
      ),
    );
    expect(numberInput().value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();

    // An empty field assigns nothing: the split is not assigned twice.
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('alert').textContent).toBe(
      'Введите номер участника для назначения отсечки',
    );
  });

  it('keeps a refused assignment out of the field and shows the server reason', async () => {
    const onAssign = vi
      .fn()
      .mockResolvedValue({ status: 'REJECTED', reason: 'Отсечка уже присвоена' });
    render(
      <NumberCaptureField
        resolve={() => []}
        onCommit={vi.fn()}
        assignment={{ splitId: 'split-1', attemptLabel: '5 км · Мужчины' }}
        onAssign={onAssign}
      />,
    );

    fireEvent.change(numberInput(), { target: { value: '42' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() =>
      expect(statusText()).toBe('Отклонено: № 42 — Отсечка уже присвоена'),
    );
    // The refused number is never written back into the field.
    expect(numberInput().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
