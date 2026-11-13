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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function numberInput(): HTMLInputElement {
  return screen.getByLabelText('Номер участника') as HTMLInputElement;
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
  it('commits a typed number with Enter and clears it after the promise resolves', async () => {
    const gate = deferred();
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
    expect(numberInput().value).toBe('17');
    expect(screen.getByText('Отправляем отметку…')).not.toBeNull();

    gate.resolve();
    await waitFor(() => expect(numberInput().value).toBe(''));
    expect(screen.queryByText('Отправляем отметку…')).toBeNull();
  });

  it('commits with Space, which never becomes part of the number', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
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

    const onCommit = vi.fn().mockResolvedValue(undefined);
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
  });

  it('does not submit twice while the first commit is pending', async () => {
    const gate = deferred();
    const onCommit = vi.fn(() => gate.promise);
    render(
      <NumberCaptureField resolve={() => [candidate()]} onCommit={onCommit} />,
    );

    fireEvent.change(numberInput(), { target: { value: '17' } });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    fireEvent.keyDown(numberInput(), { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(numberInput(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);

    gate.resolve();
    await waitFor(() => expect(numberInput().value).toBe(''));
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
});
