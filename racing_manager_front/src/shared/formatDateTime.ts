const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const DATE_TIME_DISPLAY_FORMAT = 'D MMMM HH:mm';

export const dateTimePickerProps = {
  showTime: { format: 'HH:mm' },
  format: DATE_TIME_DISPLAY_FORMAT,
  style: { width: '100%' },
} as const;

export function parseDisplayDate(value: string): Date | null {
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDisplayDate(value);
  if (!date) return value;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${hours}:${minutes}`;
}

export function toLocalIsoDate(value: string): string {
  const date = parseDisplayDate(value);
  if (!date) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
