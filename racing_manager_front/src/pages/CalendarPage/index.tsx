import { Alert, Button, Card, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useRecentEventsQuery } from '../../features/events/useRecentEventsQuery';
import { AppShell } from '../../shared/layout';
import { EventsCalendar } from './components';

export function CalendarPage() {
  const navigate = useNavigate();
  const eventsQuery = useRecentEventsQuery();

  return (
    <AppShell title="Календарь" subtitle="Запланированные и прошедшие мероприятия">
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
  );
}
