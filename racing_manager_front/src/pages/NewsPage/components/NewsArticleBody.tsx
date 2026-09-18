import { sanitizeNewsHtml } from '../../../features/news/sanitizeNewsHtml';

type NewsArticleBodyProps = {
  html: string;
};

export function NewsArticleBody({ html }: NewsArticleBodyProps) {
  return (
    <div
      className="news-article-body"
      dangerouslySetInnerHTML={{ __html: sanitizeNewsHtml(html) }}
    />
  );
}
