import { PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { canCreateEvents } from '../../features/auth/canCreateEvents';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { recentEventsQueryKey } from '../../features/events/useRecentEventsQuery';
import { AppShell } from '../../shared/layout';
import { CreateEventModal } from '../MainPage/components';
import { EventsCalendar } from './components';

export function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        <EventsCalendar onEventOpen={(eventId) => navigate(`/events/${eventId}`)} />
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
