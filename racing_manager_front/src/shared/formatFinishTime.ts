const MAX_FINISH_TIME_MS = 24 * 60 * 60 * 1000;

export function formatFinishTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const frac = millis === 0 ? '' : `.${String(millis).replace(/0+$/, '')}`;
  if (hours > 0) return `${hours}:${mm}:${ss}${frac}`;
  return `${mm}:${ss}${frac}`;
}

export function parseFinishTime(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => part === '')) {
    throw new Error('INVALID_FINISH_TIME');
  }

  const parseSegment = (value: string, allowFraction: boolean): number => {
    const pattern = allowFraction ? /^\d{1,2}(?:\.\d{1,3})?$/ : /^\d{1,2}$/;
    if (!pattern.test(value)) throw new Error('INVALID_FINISH_TIME');
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error('INVALID_FINISH_TIME');
    return numeric;
  };

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = Number(parts[0]);
    if (!/^\d{1,2}$/.test(parts[0]) || !Number.isInteger(hours) || hours < 0) {
      throw new Error('INVALID_FINISH_TIME');
    }
    minutes = parseSegment(parts[1], false);
    seconds = parseSegment(parts[2], true);
    if (minutes >= 60 || Math.floor(seconds) >= 60) {
      throw new Error('INVALID_FINISH_TIME');
    }
  } else {
    minutes = Number(parts[0]);
    if (!/^\d{1,3}$/.test(parts[0]) || !Number.isInteger(minutes) || minutes < 0) {
      throw new Error('INVALID_FINISH_TIME');
    }
    seconds = parseSegment(parts[1], true);
    if (Math.floor(seconds) >= 60) {
      throw new Error('INVALID_FINISH_TIME');
    }
  }

  const ms = Math.round(hours * 3_600_000 + minutes * 60_000 + seconds * 1000);
  if (ms <= 0 || ms > MAX_FINISH_TIME_MS) {
    throw new Error('INVALID_FINISH_TIME');
  }
  return ms;
}
