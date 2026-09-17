import { Button, Card, Modal, Result, Skeleton, Space, Tag, Typography, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { canManageNews } from '../../features/auth/canManageNews';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { newsArticleQueryKey, useNewsArticleQuery } from '../../features/news/useNewsArticleQuery';
import { newsListQueryKey } from '../../features/news/useNewsListQuery';
import { newsService } from '../../features/news/newsService';
import { formatDateTime } from '../../shared/formatDateTime';
import { AppShell } from '../../shared/layout';
import { NewsArticleBody } from './components/NewsArticleBody';

export function NewsArticlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const articleQuery = useNewsArticleQuery(id);
  const canManage = canManageNews(sessionQuery.data?.roles);
  const article = articleQuery.data;

  const handleDelete = () => {
    if (!article) return;
    Modal.confirm({
      title: 'Удалить новость?',
      content: `«${article.title}» будет удалена без возможности восстановления.`,
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await newsService.remove(article.id);
          await queryClient.invalidateQueries({ queryKey: newsListQueryKey });
          queryClient.removeQueries({ queryKey: newsArticleQueryKey(article.id) });
          message.success('Новость удалена');
          navigate('/news');
        } catch (error) {
          message.error(newsService.getErrorMessage(error));
          throw error;
        }
      },
    });
  };

  if (articleQuery.isLoading) {
    return (
      <AppShell title="Новость" subtitle="Загрузка статьи">
        <Card>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      </AppShell>
    );
  }

  if (articleQuery.isError || !article) {
    const status = newsService.getStatus(articleQuery.error);
    return (
      <AppShell title="Новость" subtitle="Статья не найдена">
        <Result
          status={status === 404 ? '404' : 'error'}
          title={status === 404 ? 'Новость не найдена' : 'Не удалось загрузить новость'}
          extra={
            <Button type="primary" onClick={() => navigate('/news')}>
              Ко всем новостям
            </Button>
          }
        />
      </AppShell>
    );
  }

  const extra = canManage ? (
    <Space>
      <Button onClick={() => navigate(`/news/${article.id}/edit`)}>Редактировать</Button>
      <Button danger onClick={handleDelete}>
        Удалить
      </Button>
    </Space>
  ) : undefined;

  return (
    <AppShell title={article.title} subtitle={article.track.name} extra={extra}>
      <Card>
        <Space wrap size={8} style={{ marginBottom: 12 }}>
          <Tag>{article.track.name}</Tag>
          <Typography.Text type="secondary">{formatDateTime(article.publishedAt)}</Typography.Text>
          {article.createdBy ? (
            <Typography.Text type="secondary">Автор: {article.createdBy.name}</Typography.Text>
          ) : null}
        </Space>
        <NewsArticleBody html={article.body} />
        <Button type="link" onClick={() => navigate('/news')} style={{ paddingInline: 0, marginTop: 16 }}>
          Ко всем новостям
        </Button>
      </Card>
    </AppShell>
  );
}
