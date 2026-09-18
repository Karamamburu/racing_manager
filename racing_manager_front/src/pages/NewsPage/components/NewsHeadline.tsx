import { Link } from 'react-router-dom';
import { NotificationOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import type { ReactNode } from 'react';

type NewsHeadlineProps = {
  title: ReactNode;
  coverImageUrl?: string | null;
  coverAlt?: string;
  coverTo?: string;
  description?: ReactNode;
  size: 'list' | 'article';
};

export function NewsHeadline({
  title,
  coverImageUrl,
  coverAlt = '',
  coverTo,
  description,
  size,
}: NewsHeadlineProps) {
  const cover = coverImageUrl ? (
    <span className={`news-headline__cover news-headline__cover--${size}`}>
      <img
        src={coverImageUrl}
        alt={coverAlt}
        loading={size === 'list' ? 'lazy' : 'eager'}
      />
    </span>
  ) : size === 'list' ? (
    <span className="news-headline__fallback">
      <NotificationOutlined />
    </span>
  ) : null;

  const linkedCover =
    cover && coverTo ? (
      <Link to={coverTo} className="news-headline__cover-link" tabIndex={-1}>
        {cover}
      </Link>
    ) : (
      cover
    );

  return (
    <div className={`news-headline news-headline--${size}`}>
      {linkedCover}
      <div className="news-headline__body">
        {size === 'article' ? (
          <Typography.Title level={3} className="news-headline__title">
            {title}
          </Typography.Title>
        ) : (
          <div className="news-headline__title">{title}</div>
        )}
        {description}
      </div>
    </div>
  );
}
