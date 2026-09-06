import type { EventDetails } from '../../shared/types/event';

export function isEventRegistrationOpen(
  event: Pick<EventDetails, 'status' | 'registrationOpen' | 'registrationClose'>,
  now = new Date(),
): boolean {
  if (event.status !== 'PLANNED') return false;
  if (event.registrationOpen && now < new Date(event.registrationOpen)) return false;
  if (event.registrationClose && now > new Date(event.registrationClose)) return false;
  return true;
}

export function registrationClosedReason(
  event: Pick<EventDetails, 'status' | 'registrationOpen' | 'registrationClose'>,
  now = new Date(),
): string | null {
  if (event.status !== 'PLANNED') return 'Регистрация доступна только на запланированное мероприятие';
  if (event.registrationOpen && now < new Date(event.registrationOpen)) {
    return 'Регистрация ещё не открыта';
  }
  if (event.registrationClose && now > new Date(event.registrationClose)) {
    return 'Регистрация закрыта';
  }
  return null;
}
