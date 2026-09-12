const MAX_FINISH_TIME_MS = 24 * 60 * 60 * 1000;
const MAX_DURATION_DIGITS = 6;

export function formatFinishTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const frac = millis === 0 ? '' : `.${String(millis).replace(/0+$/, '')}`;
  return `${hh}:${mm}:${ss}${frac}`;
}

export function finishTimeMsToDigits(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}`.replace(
    /^0+/,
    '',
  );
}

export function formatDurationDigits(digits: string): string {
  const padded = normalizeDurationDigits(digits);
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
}

export function appendDurationDigit(digits: string, digit: string): string {
  if (!/^\d$/.test(digit)) return digits;
  return (digits + digit).replace(/\D/g, '').slice(-MAX_DURATION_DIGITS);
}

export function parseDurationDigits(digits: string): number | null {
  const padded = normalizeDurationDigits(digits);
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  const seconds = Number(padded.slice(4, 6));
  if (minutes >= 60 || seconds >= 60) {
    throw new Error('INVALID_FINISH_TIME');
  }
  const ms = (hours * 3600 + minutes * 60 + seconds) * 1000;
  if (ms <= 0) return null;
  if (ms > MAX_FINISH_TIME_MS) {
    throw new Error('INVALID_FINISH_TIME');
  }
  return ms;
}

function normalizeDurationDigits(digits: string): string {
  return digits.replace(/\D/g, '').slice(-MAX_DURATION_DIGITS).padStart(MAX_DURATION_DIGITS, '0');
}
