import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CaptureControls } from './CaptureControls';
import type { TimingCaptureView } from './types';

const WORKSTATION = 'station-a';
/** The reason a transfer is withheld while this device has unsent entries (S-09). */
const UNSENT_TRANSFER_REASON =
  'Передача захвата недоступна: есть неотправленные записи.';
/** The reason a transfer is withheld while the page has no connection (F-04). */
const OFFLINE_REASON = 'Нужна связь с сервером.';

function capture(
  overrides: Partial<TimingCaptureView> = {},
): TimingCaptureView {
  return {
    eventId: 'event-1',
    workstationInstanceId: null,
    heldByUserId: null,
    heldAt: null,
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

describe('CaptureControls', () => {
  it('shows a free capture and offers to take it', () => {
    render(
      <CaptureControls
        capture={capture()}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
      />,
    );

    expect(screen.getByText('Захват свободен')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Взять захват' })).not.toBeNull();
    expect(screen.queryByLabelText('Устройство назначения')).toBeNull();
  });

  it('names the other station and still offers to take the capture', () => {
    render(
      <CaptureControls
        capture={capture({
          workstationInstanceId: 'station-b',
          heldByUserId: 'user-2',
          heldAt: '2026-11-13T09:00:00.000Z',
        })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
      />,
    );

    expect(screen.getByText('Захват у устройства station-b')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Взять захват' })).not.toBeNull();
    expect(screen.queryByLabelText('Устройство назначения')).toBeNull();
  });

  it('offers transfer only to the station that holds the capture', () => {
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
      />,
    );

    expect(screen.getByText('Захват у этого устройства')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Взять захват' })).toBeNull();
    expect(screen.getByLabelText('Устройство назначения')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Передать захват' }),
    ).not.toBeNull();
  });

  it('takes the capture and shows the busy button while the request runs', async () => {
    const gate = deferred();
    const onTake = vi.fn(() => gate.promise);
    render(
      <CaptureControls
        capture={capture()}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={onTake}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
      />,
    );

    const takeButton = screen.getByRole('button', {
      name: 'Взять захват',
    }) as HTMLButtonElement;
    fireEvent.click(takeButton);

    await waitFor(() => expect(onTake).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(takeButton.disabled).toBe(true));

    gate.resolve();
    await waitFor(() => expect(takeButton.disabled).toBe(false));
  });

  it('shows the refusal of a take instead of claiming the capture', async () => {
    const onTake = vi
      .fn()
      .mockRejectedValue(new Error('Захват удерживает другое устройство'));
    render(
      <CaptureControls
        capture={capture()}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={onTake}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Взять захват' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Захват удерживает другое устройство',
      ),
    );
    expect(screen.getByText('Захват свободен')).not.toBeNull();
  });

  it('passes the typed target device to the transfer', async () => {
    const onTransfer = vi.fn().mockResolvedValue(undefined);
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={onTransfer}
        onForceRelease={vi.fn()}
      />,
    );

    const target = screen.getByLabelText(
      'Устройство назначения',
    ) as HTMLInputElement;
    fireEvent.change(target, { target: { value: ' station-b ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Передать захват' }));

    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('station-b'));
    await waitFor(() => expect(target.value).toBe(''));
  });

  it('refuses a transfer to the device that already holds capture', () => {
    const onTransfer = vi.fn();
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={onTransfer}
        onForceRelease={vi.fn()}
      />,
    );

    const target = screen.getByLabelText(
      'Устройство назначения',
    ) as HTMLInputElement;
    fireEvent.change(target, { target: { value: WORKSTATION } });
    fireEvent.click(screen.getByRole('button', { name: 'Передать захват' }));

    expect(onTransfer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Это устройство уже удерживает захват',
    );
  });

  it('refuses a transfer without a target device', () => {
    const onTransfer = vi.fn();
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={onTransfer}
        onForceRelease={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Передать захват' }));
    expect(onTransfer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Укажите устройство назначения',
    );
  });

  it('offers force-release only to an administrator and requires a reason', async () => {
    const onForceRelease = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <CaptureControls
        capture={capture({ workstationInstanceId: 'station-b' })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={onForceRelease}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Освободить' })).toBeNull();

    rerender(
      <CaptureControls
        capture={capture({ workstationInstanceId: 'station-b' })}
        workstationInstanceId={WORKSTATION}
        canAdminister
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={onForceRelease}
      />,
    );

    const releaseButton = screen.getByRole('button', { name: 'Освободить' });
    fireEvent.click(releaseButton);
    expect(onForceRelease).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'Укажите причину освобождения',
    );

    fireEvent.change(screen.getByLabelText('Причина освобождения'), {
      target: { value: ' Планшет потерял связь ' },
    });
    fireEvent.click(releaseButton);

    await waitFor(() =>
      expect(onForceRelease).toHaveBeenCalledWith('Планшет потерял связь'),
    );
  });

  it('offers transfer by default: online and no unsent entry', () => {
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Устройство назначения')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Передать захват' }),
    ).not.toBeNull();
    expect(screen.queryByText(UNSENT_TRANSFER_REASON)).toBeNull();
    expect(screen.queryByText(OFFLINE_REASON)).toBeNull();
  });

  it('withholds transfer while this device has an unsent entry and names the reason', () => {
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
        unsentEntries={2}
      />,
    );

    expect(screen.queryByLabelText('Устройство назначения')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Передать захват' }),
    ).toBeNull();
    expect(screen.getByText(UNSENT_TRANSFER_REASON)).not.toBeNull();
    // The holder tag and the other controls keep their meaning (U-06).
    expect(screen.getByText('Захват у этого устройства')).not.toBeNull();
  });

  it('withholds transfer while the page has no connection and states the reason', () => {
    render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
        isOnline={false}
      />,
    );

    expect(screen.queryByLabelText('Устройство назначения')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Передать захват' }),
    ).toBeNull();
    expect(screen.getByText(OFFLINE_REASON)).not.toBeNull();
    expect(screen.queryByText(UNSENT_TRANSFER_REASON)).toBeNull();
  });

  it('offers transfer again when the page is online and every entry has an answer', () => {
    const { rerender } = render(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
        isOnline={false}
        unsentEntries={1}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Передать захват' }),
    ).toBeNull();
    // Both facts are true at once and both stay readable.
    expect(screen.getByText(OFFLINE_REASON)).not.toBeNull();
    expect(screen.getByText(UNSENT_TRANSFER_REASON)).not.toBeNull();

    rerender(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
        isOnline={false}
        unsentEntries={0}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Передать захват' }),
    ).toBeNull();
    expect(screen.getByText(OFFLINE_REASON)).not.toBeNull();
    expect(screen.queryByText(UNSENT_TRANSFER_REASON)).toBeNull();

    rerender(
      <CaptureControls
        capture={capture({ workstationInstanceId: WORKSTATION })}
        workstationInstanceId={WORKSTATION}
        canAdminister={false}
        onTake={vi.fn()}
        onTransfer={vi.fn()}
        onForceRelease={vi.fn()}
        isOnline
        unsentEntries={0}
      />,
    );

    expect(screen.getByLabelText('Устройство назначения')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Передать захват' }),
    ).not.toBeNull();
    expect(screen.queryByText(OFFLINE_REASON)).toBeNull();
    expect(screen.queryByText(UNSENT_TRANSFER_REASON)).toBeNull();
  });

  it('keeps take-capture and force-release available while transfer is withheld', async () => {
    const onTake = vi.fn().mockResolvedValue(undefined);
    const onForceRelease = vi.fn().mockResolvedValue(undefined);
    render(
      <CaptureControls
        capture={capture()}
        workstationInstanceId={WORKSTATION}
        canAdminister
        onTake={onTake}
        onTransfer={vi.fn()}
        onForceRelease={onForceRelease}
        isOnline={false}
        unsentEntries={3}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Взять захват' }));
    await waitFor(() => expect(onTake).toHaveBeenCalledTimes(1));
    // The refusal of a transfer never leaks into the other actions.
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(screen.getByLabelText('Причина освобождения'), {
      target: { value: ' Планшет потерял связь ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Освободить' }));

    await waitFor(() =>
      expect(onForceRelease).toHaveBeenCalledWith('Планшет потерял связь'),
    );
  });
});
