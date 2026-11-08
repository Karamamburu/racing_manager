import { ClockCircleTwoTone, FlagTwoTone, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Col, Row, Skeleton, Space, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canCreateEvents } from '../../features/auth/canCreateEvents';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { visibleCatalogEvents } from '../../features/events/catalogEvents';
import { buildUpcomingRows } from '../../features/events/upcomingRows';
import {
  recentEventsQueryKey,
  useRecentEventsQuery,
} from '../../features/events/useRecentEventsQuery';
import { mainSlides } from '../../features/main/mainSlides';
import { usePlatformStatsQuery } from '../../features/main/usePlatformStatsQuery';
import { PromoSlider } from '../../shared/components';
import { eventStatusMeta } from '../../shared/eventStatus';
import { AppShell } from '../../shared/layout';
import type { MainEventRow } from '../../shared/types/main';
import { CreateEventModal } from './components';

function getEventColumns(onEventOpen: (eventId: string) => void): ColumnsType<MainEventRow> {
  return [
    {
      title: 'Событие',
      dataIndex: 'event',
      key: 'event',
      render: (event: string, record) =>
        record.isStart ? (
          <span style={{ paddingLeft: 16 }}>{event}</span>
        ) : (
          <Button type="link" onClick={() => onEventOpen(record.key)} style={{ paddingInline: 0 }}>
            {event}
          </Button>
        ),
    },
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      render: (date: string, record) => (record.isStart ? '' : date),
    },
    {
      title: 'Дистанция',
      dataIndex: 'distanceKm',
      key: 'distanceKm',
      render: (distanceKm: number | null) =>
        distanceKm == null ? '' : `${distanceKm} км`,
    },
    { title: 'Зарегистрировано', dataIndex: 'registeredCount', key: 'registeredCount' },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: MainEventRow['status'], record) => {
        if (record.isStart) return '';
        const meta = eventStatusMeta(status);
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
    },
    {
      title: 'Трасса',
      dataIndex: 'track',
      key: 'track',
      render: (track: string, record) => (record.isStart ? '' : track),
    },
  ];
}

export function MainPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const eventsQuery = useRecentEventsQuery();
  const statsQuery = usePlatformStatsQuery();
  const sessionQuery = useSessionQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const canCreate = canCreateEvents(sessionQuery.data?.roles);
  const upcomingEvents = visibleCatalogEvents(eventsQuery.data ?? [], false);
  const visibleEvents = showPastEvents
    ? visibleCatalogEvents(eventsQuery.data ?? [], true)
    : upcomingEvents;
  const upcomingCount = upcomingEvents.length;
  const upcomingRegistrations = upcomingEvents.reduce(
    (sum, event) => sum + event.registeredCount,
    0,
  );

  const extra = canCreate ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateOpen(true)}>
      Создать мероприятие
    </Button>
  ) : undefined;

  const createModal = (
    <CreateEventModal
      open={isCreateOpen}
      onClose={() => setIsCreateOpen(false)}
      onCreated={() => {
        void queryClient.invalidateQueries({ queryKey: recentEventsQueryKey });
      }}
    />
  );

  return (
    <>
      <AppShell
        title="Главная страница"
        subtitle="Сводка по соревнованиям, трассам и активности участников"
        extra={extra}
      >
        <Space direction="vertical" size={24} className="main-page">
          <PromoSlider slides={mainSlides} />

          <Row gutter={[16, 16]} className="main-page-stats">
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="Ближайшие мероприятия"
                  value={eventsQuery.isLoading ? undefined : upcomingCount}
                  prefix={<ClockCircleTwoTone />}
                  loading={eventsQuery.isLoading}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="Зарегистрированных пользователей на платформе"
                  value={statsQuery.isLoading ? undefined : statsQuery.data?.registeredUsers}
                  prefix={<TeamOutlined />}
                  loading={statsQuery.isLoading}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="Заявок на ближайшие старты"
                  value={eventsQuery.isLoading ? undefined : upcomingRegistrations}
                  prefix={<FlagTwoTone />}
                  loading={eventsQuery.isLoading}
                />
              </Card>
            </Col>
          </Row>

          <Card
            className="main-events-card"
            title="Ближайшие события"
            extra={
              <Checkbox
                checked={showPastEvents}
                onChange={(event) => setShowPastEvents(event.target.checked)}
              >
                Показать прошедшие
              </Checkbox>
            }
          >
            {eventsQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : eventsQuery.isError ? (
              <Alert
                type="error"
                showIcon
                message="Не удалось загрузить мероприятия"
                action={
                  <Button size="small" type="primary" onClick={() => eventsQuery.refetch()}>
                    Повторить
                  </Button>
                }
              />
            ) : (
              <Table
                rowKey="key"
                columns={getEventColumns((eventId) => navigate(`/events/${eventId}`))}
                dataSource={buildUpcomingRows(visibleEvents)}
                pagination={false}
                scroll={{ x: 'max-content' }}
                defaultExpandAllRows
                locale={{
                  emptyText: showPastEvents ? 'Пока нет мероприятий' : 'Нет ближайших мероприятий',
                }}
              />
            )}
          </Card>
        </Space>
      </AppShell>
      {createModal}
    </>
  );
}
