import {
  ArrowRightOutlined,
  CheckCircleTwoTone,
  ClockCircleTwoTone,
  PlusOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Col, Row, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canCreateEvents } from '../../features/auth/canCreateEvents';
import { visibleCatalogEvents } from '../../features/events/catalogEvents';
import { usePersonalQuery } from '../../features/auth/usePersonalQuery';
import {
  recentEventsQueryKey,
  useRecentEventsQuery,
} from '../../features/events/useRecentEventsQuery';
import { useMainDashboardQuery } from '../../features/main/useMainDashboardQuery';
import { PromoSlider } from '../../shared/components';
import { AppShell } from '../../shared/layout';
import type { RecentEventRow } from '../../shared/types/event';
import type { MainEventRow, MainStat } from '../../shared/types/main';
import { CreateEventModal } from './components';

function toMainEventRow(event: RecentEventRow): MainEventRow {
  return {
    key: event.id,
    event: event.name,
    date: event.eventDate,
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

const statPrefixes: Record<string, ReactNode> = {
  'upcoming-races': <ClockCircleTwoTone />,
  'active-tracks': <CheckCircleTwoTone twoToneColor="#52c41a" />,
};

export function MainPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useMainDashboardQuery();
  const eventsQuery = useRecentEventsQuery();
  const personalQuery = usePersonalQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const canCreate = canCreateEvents(personalQuery.data?.roles);
  const visibleEvents = visibleCatalogEvents(eventsQuery.data ?? [], showPastEvents);

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

  const eventsTable = (
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
  );

  if (isLoading) {
    return (
      <>
        <AppShell
          title="Главная страница"
          subtitle="Сводка по соревнованиям, трассам и активности участников"
          extra={extra}
        >
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Card>
              <Skeleton active paragraph={{ rows: 4 }} />
            </Card>
            {eventsTable}
          </Space>
        </AppShell>
        {createModal}
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <AppShell
          title="Главная страница"
          subtitle="Сводка по соревнованиям, трассам и активности участников"
          extra={extra}
        >
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Alert
              type="error"
              showIcon
              message="Не удалось загрузить данные главной страницы"
              description="Попробуйте обновить данные. Сейчас используется имитация серверного запроса."
              action={
                <Button size="small" type="primary" onClick={() => refetch()}>
                  Повторить
                </Button>
              }
            />
            {eventsTable}
          </Space>
        </AppShell>
        {createModal}
      </>
    );
  }

  return (
    <>
      <AppShell
        title="Главная страница"
        subtitle="Сводка по соревнованиям, трассам и активности участников"
        extra={extra}
      >
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <PromoSlider slides={data.slides} />

          <Row gutter={[16, 16]}>
            {data.stats.map((stat: MainStat) => (
              <Col key={stat.key} xs={24} md={8}>
                <Card>
                  <Statistic
                    title={stat.title}
                    value={stat.value}
                    suffix={stat.suffix}
                    prefix={statPrefixes[stat.key]}
                  />
                  {stat.actionLabel ? (
                    <Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/cabinet')}>
                      {stat.actionLabel}
                    </Button>
                  ) : (
                    <Typography.Text type="secondary">{stat.description}</Typography.Text>
                  )}
                </Card>
              </Col>
            ))}
          </Row>

          {eventsTable}
        </Space>
      </AppShell>
      {createModal}
    </>
  );
}
