const NAKARTE_HOSTS = new Set(['nakarte.me', 'www.nakarte.me']);
const EMBED_MIN = 'min=1/1/1/1';

export function parseNakarteMapLink(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Укажите ссылку вида https://nakarte.me/#...');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Ссылка должна начинаться с https://');
  }

  const host = url.hostname.toLowerCase();
  if (!NAKARTE_HOSTS.has(host) || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Можно указать только ссылку с nakarte.me');
  }

  return trimmed;
}

export async function validateNakarteMapLink(_rule: unknown, value?: string) {
  try {
    parseNakarteMapLink(value);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error('Некорректная ссылка'));
  }
}

export function toNakarteEmbedUrl(mapLink: string): string {
  const hashIndex = mapLink.indexOf('#');
  if (hashIndex === -1) {
    return `${mapLink.replace(/\/$/, '')}#${EMBED_MIN}`;
  }

  const base = mapLink.slice(0, hashIndex);
  const hash = mapLink.slice(hashIndex + 1);
  if (/(?:^|&)min=/.test(hash)) return mapLink;
  if (!hash) return `${base}#${EMBED_MIN}`;
  return `${base}#${hash}&${EMBED_MIN}`;
}
