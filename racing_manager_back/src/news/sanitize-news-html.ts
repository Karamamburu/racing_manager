import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'div',
  'span',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'sub',
  'sup',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
  'caption',
];

const STYLE_PATTERN = [/.+/];

export function sanitizeNewsHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      td: ['colspan', 'rowspan', 'align'],
      th: ['colspan', 'rowspan', 'align'],
      col: ['span', 'width'],
      ol: ['type', 'start'],
      ul: ['type'],
      '*': ['style', 'class', 'align'],
    },
    allowedStyles: {
      '*': {
        color: STYLE_PATTERN,
        'background-color': STYLE_PATTERN,
        'font-size': STYLE_PATTERN,
        'font-family': STYLE_PATTERN,
        'font-weight': STYLE_PATTERN,
        'font-style': STYLE_PATTERN,
        'text-align': STYLE_PATTERN,
        'text-decoration': STYLE_PATTERN,
        'line-height': STYLE_PATTERN,
        'vertical-align': STYLE_PATTERN,
        margin: STYLE_PATTERN,
        'margin-left': STYLE_PATTERN,
        'margin-right': STYLE_PATTERN,
        padding: STYLE_PATTERN,
        width: STYLE_PATTERN,
        height: STYLE_PATTERN,
        border: STYLE_PATTERN,
        'border-collapse': STYLE_PATTERN,
        'border-color': STYLE_PATTERN,
        'list-style-type': STYLE_PATTERN,
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
        },
      }),
    },
  }).trim();
}

export function newsHtmlToPlainText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();
}
