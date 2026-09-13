import { PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Skeleton } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canCreateEvents } from '../../features/auth/canCreateEvents';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import {
  recentEventsQueryKey,
  useRecentEventsQuery,
} from '../../features/events/useRecentEventsQuery';
import { AppShell } from '../../shared/layout';
import { CreateEventModal } from '../MainPage/components';
import { EventsCalendar } from './components';

export function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const eventsQuery = useRecentEventsQuery();
  const sessionQuery = useSessionQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const canCreate = canCreateEvents(sessionQuery.data?.roles);

  const extra = canCreate ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateOpen(true)}>
      Создать мероприятие
    </Button>
  ) : undefined;

  return (
    <>
      <AppShell title="Календарь" subtitle="Запланированные и прошедшие мероприятия" extra={extra}>
        {eventsQuery.isLoading ? (
          <Card>
            <Skeleton active paragraph={{ rows: 12 }} />
          </Card>
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
          <EventsCalendar
            events={eventsQuery.data ?? []}
            onEventOpen={(eventId) => navigate(`/events/${eventId}`)}
          />
        )}
      </AppShell>
      <CreateEventModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: recentEventsQueryKey });
        }}
      />
    </>
  );
}
