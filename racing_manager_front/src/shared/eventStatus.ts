export const EventStatusCode = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;

export type EventStatusCode =
  (typeof EventStatusCode)[keyof typeof EventStatusCode];

export const EVENT_STATUSES = [
  EventStatusCode.PLANNED,
  EventStatusCode.IN_PROGRESS,
  EventStatusCode.DONE,
  EventStatusCode.CANCELLED,
] as const;

export type EventStatusMeta = {
  text: string;
  color: string;
  badge: 'processing' | 'warning' | 'success' | 'error' | 'default';
};

export const EVENT_STATUS_META: Record<EventStatusCode, EventStatusMeta> = {
  PLANNED: { text: 'Запланировано', color: 'blue', badge: 'processing' },
  IN_PROGRESS: { text: 'В процессе', color: 'orange', badge: 'warning' },
  DONE: { text: 'Завершено', color: 'green', badge: 'success' },
  CANCELLED: { text: 'Отменено', color: 'red', badge: 'error' },
};

export function isEventStatus(value: string): value is EventStatusCode {
  return (EVENT_STATUSES as readonly string[]).includes(value);
}

export function eventStatusMeta(status: string): EventStatusMeta {
  if (isEventStatus(status)) return EVENT_STATUS_META[status];
  return { text: status, color: 'default', badge: 'default' };
}
