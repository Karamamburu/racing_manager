import DOMPurify from 'dompurify';

export function sanitizeNewsHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['figure', 'figcaption', 'colgroup', 'col'],
    ADD_ATTR: ['style', 'align', 'target', 'colspan', 'rowspan'],
  });
}

export function isNewsBodyEmpty(html: string | undefined): boolean {
  if (!html) return true;
  const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length === 0;
}
