import { ClockCircleTwoTone, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Col, Row, Skeleton, Space, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canCreateEvents } from '../../features/auth/canCreateEvents';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { visibleCatalogEvents } from '../../features/events/catalogEvents';
import {
  recentEventsQueryKey,
  useRecentEventsQuery,
} from '../../features/events/useRecentEventsQuery';
import { mainSlides } from '../../features/main/mainSlides';
import { PromoSlider } from '../../shared/components';
import { formatDateTime } from '../../shared/formatDateTime';
import { AppShell } from '../../shared/layout';
import type { RecentEventRow } from '../../shared/types/event';
import type { MainEventRow } from '../../shared/types/main';
import { CreateEventModal } from './components';

function toMainEventRow(event: RecentEventRow): MainEventRow {
  return {
    key: event.id,
    event: event.name,
    date: formatDateTime(event.eventDate),
    distanceKm: event.distanceKm,
    status: event.status === 'DONE' ? 'DONE' : 'PLANNED',
    track: event.trackName,
    registeredCount: event.registeredCount,
  };
}

function getEventColumns(onEventOpen: (eventId: string) => void): ColumnsType<MainEventRow> {
  return [
    {
      title: 'Событие',
      dataIndex: 'event',
      key: 'event',
      render: (event: string, record) => (
        <Button type="link" onClick={() => onEventOpen(record.key)} style={{ paddingInline: 0 }}>
          {event}
        </Button>
      ),
    },
    { title: 'Дата', dataIndex: 'date', key: 'date' },
    {
      title: 'Дистанция',
      dataIndex: 'distanceKm',
      key: 'distanceKm',
      render: (distanceKm: number | null) => (distanceKm ? `${distanceKm} км` : '-'),
    },
    { title: 'Зарегистрировано', dataIndex: 'registeredCount', key: 'registeredCount' },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: MainEventRow['status']) =>
        status === 'DONE' ? <Tag color="green">Завершено</Tag> : <Tag color="blue">Запланировано</Tag>,
    },
    { title: 'Трасса', dataIndex: 'track', key: 'track' },
  ];
}

export function MainPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const eventsQuery = useRecentEventsQuery();
  const sessionQuery = useSessionQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const canCreate = canCreateEvents(sessionQuery.data?.roles);
  const visibleEvents = visibleCatalogEvents(eventsQuery.data ?? [], showPastEvents);
  const upcomingCount = visibleCatalogEvents(eventsQuery.data ?? [], false).length;

  const extra = (
    <Space>
      {canCreate ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateOpen(true)}>
          Создать мероприятие
        </Button>
      ) : null}
      <Button type="default" onClick={() => navigate('/cabinet')}>
        Личный кабинет
      </Button>
    </Space>
  );

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
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <PromoSlider slides={mainSlides} />

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="Ближайшие гонки"
                  value={eventsQuery.isLoading ? undefined : upcomingCount}
                  prefix={<ClockCircleTwoTone />}
                  loading={eventsQuery.isLoading}
                />
              </Card>
            </Col>
          </Row>

          <Card
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
                columns={getEventColumns((eventId) => navigate(`/events/${eventId}`))}
                dataSource={visibleEvents.map(toMainEventRow)}
                pagination={false}
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
