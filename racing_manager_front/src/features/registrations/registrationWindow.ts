import type { EventDetails } from '../../shared/types/event';
import { isActiveRegistrationStatus } from '../../shared/registrationStatus';

function registrationClosesAt(
  event: Pick<EventDetails, 'eventDate' | 'registrationClose'>,
): Date {
  const eventDate = new Date(event.eventDate);
  if (!event.registrationClose) return eventDate;
  const registrationClose = new Date(event.registrationClose);
  return registrationClose < eventDate ? registrationClose : eventDate;
}

export function isRegistrationWindowClosed(
  event: Pick<EventDetails, 'eventDate' | 'registrationClose'>,
  now = new Date(),
): boolean {
  return now.getTime() > registrationClosesAt(event).getTime();
}

export function isEventRegistrationOpen(
  event: Pick<EventDetails, 'status' | 'eventDate' | 'registrationClose'>,
  now = new Date(),
): boolean {
  if (event.status !== 'PLANNED') return false;
  if (now > registrationClosesAt(event)) return false;
  return true;
}

export function registrationClosedReason(
  event: Pick<EventDetails, 'status' | 'eventDate' | 'registrationClose'>,
  now = new Date(),
): string | null {
  if (event.status !== 'PLANNED') return 'Регистрация доступна только на запланированное мероприятие';
  if (now > registrationClosesAt(event)) {
    return 'Регистрация закрыта';
  }
  return null;
}

/**
 * Whether every active registration already holds a start number.
 *
 * The bracket needs a frozen field; this is the second accepted moment for it,
 * alongside the closed registration window. A registration with no number (or
 * a zero placeholder) means number issuance is still in progress.
 */
export function areActiveStartNumbersIssued(
  registrations: ReadonlyArray<{ status: string; startNumber: number | null }>,
): boolean {
  const active = registrations.filter((registration) =>
    isActiveRegistrationStatus(registration.status),
  );
  return (
    active.length > 0 &&
    active.every(
      (registration) =>
        registration.startNumber !== null && registration.startNumber > 0,
    )
  );
}
