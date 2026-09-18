import DOMPurify from 'dompurify';

export function sanitizeNewsHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['figure', 'figcaption', 'colgroup', 'col', 'video', 'source'],
    ADD_ATTR: [
      'style',
      'align',
      'target',
      'colspan',
      'rowspan',
      'controls',
      'playsinline',
      'preload',
      'poster',
      'type',
    ],
  });
}

export function isNewsBodyEmpty(html: string | undefined): boolean {
  if (!html) return true;
  const sanitized = sanitizeNewsHtml(html);
  const text = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [] })
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 0) return false;
  return !/<(img|video)\b/i.test(sanitized);
}
