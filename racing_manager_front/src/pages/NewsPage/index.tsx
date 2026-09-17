import { NotificationOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, List, Select, Skeleton, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { canManageNews } from '../../features/auth/canManageNews';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useNewsListQuery } from '../../features/news/useNewsListQuery';
import { useCatalogTracksQuery } from '../../features/tracks/useCatalogTracksQuery';
import { formatDateTime } from '../../shared/formatDateTime';
import { AppShell } from '../../shared/layout';

export function NewsPage() {
  const navigate = useNavigate();
  const sessionQuery = useSessionQuery();
  const tracksQuery = useCatalogTracksQuery();
  const [trackId, setTrackId] = useState<string>('all');
  const newsQuery = useNewsListQuery(trackId === 'all' ? undefined : trackId);
  const canCreate = canManageNews(sessionQuery.data?.roles);

  const trackOptions = useMemo(
    () => [
      { value: 'all', label: 'Все трассы' },
      ...(tracksQuery.data ?? []).map((track) => ({
        value: track.id,
        label: track.name,
      })),
    ],
    [tracksQuery.data],
  );

  return (
    <AppShell
      title="Новости"
      subtitle="Статьи и объявления по трассам сообщества"
      extra={
        canCreate ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/news/new')}>
            Создать новость
          </Button>
        ) : undefined
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Card
          extra={
            <Space wrap>
              <Typography.Text>Трасса</Typography.Text>
              <Select
                value={trackId}
                options={trackOptions}
                onChange={setTrackId}
                style={{ minWidth: 220 }}
                loading={tracksQuery.isLoading}
              />
            </Space>
          }
        >
          {newsQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : newsQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="Не удалось загрузить новости"
              action={
                <Button size="small" type="primary" onClick={() => newsQuery.refetch()}>
                  Повторить
                </Button>
              }
            />
          ) : (newsQuery.data ?? []).length === 0 ? (
            <Empty description="Пока нет новостей" />
          ) : (
            <List
              itemLayout="vertical"
              dataSource={newsQuery.data}
              renderItem={(item) => (
                <List.Item
                  key={item.id}
                  actions={[
                    <Link key="open" to={`/news/${item.id}`}>
                      Читать
                    </Link>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<NotificationOutlined style={{ fontSize: 20 }} />}
                    title={
                      <Space wrap size={8}>
                        <Link to={`/news/${item.id}`}>{item.title}</Link>
                        <Tag>{item.track.name}</Tag>
                      </Space>
                    }
                    description={formatDateTime(item.publishedAt)}
                  />
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {item.excerpt || ' '}
                  </Typography.Paragraph>
                </List.Item>
              )}
            />
          )}
        </Card>
      </Space>
    </AppShell>
  );
}
