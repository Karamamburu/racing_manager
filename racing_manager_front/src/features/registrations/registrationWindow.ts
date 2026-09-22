import type { EventDetails } from '../../shared/types/event';

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
