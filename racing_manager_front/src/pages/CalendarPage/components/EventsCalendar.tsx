import { Badge, Button, Calendar, Card, Empty, List, Space, Tag } from 'antd';
import type { CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import {
  calendarEvents,
  formatEventsCount,
  groupEventsByDate,
  groupEventsByMonth,
} from '../../../features/events/calendarEvents';
import { eventStatusMeta } from '../../../shared/eventStatus';
import { formatDateTime } from '../../../shared/formatDateTime';
import type { RecentEventRow } from '../../../shared/types/event';

type CalendarMode = NonNullable<CalendarProps<Dayjs>['mode']>;

type EventsCalendarProps = {
  events: RecentEventRow[];
  onEventOpen: (eventId: string) => void;
};

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const;

function periodTitle(date: Dayjs, mode: CalendarMode): string {
  if (mode === 'year') {
    return `Мероприятия на ${MONTHS_NOMINATIVE[date.month()]} ${date.year()}`;
  }
  return `Мероприятия на ${date.format('D MMMM YYYY')}`;
}

function statusTag(status: RecentEventRow['status']) {
  const meta = eventStatusMeta(status);
  return <Tag color={meta.color}>{meta.text}</Tag>;
}

export function EventsCalendar({ events, onEventOpen }: EventsCalendarProps) {
  const [value, setValue] = useState(() => dayjs());
  const [mode, setMode] = useState<CalendarMode>('month');
  const visibleEvents = useMemo(() => calendarEvents(events), [events]);
  const eventsByDate = useMemo(() => groupEventsByDate(visibleEvents), [visibleEvents]);
  const eventsByMonth = useMemo(() => groupEventsByMonth(visibleEvents), [visibleEvents]);
  const dateKey = value.format('YYYY-MM-DD');
  const monthKey = value.format('YYYY-MM');
  const selectedDayEvents = eventsByDate.get(dateKey) ?? [];
  const selectedMonthEvents = eventsByMonth.get(monthKey) ?? [];
  const selectedEvents = mode === 'year' ? selectedMonthEvents : selectedDayEvents;

  const dateCellRender = (date: Dayjs) => {
    const items = eventsByDate.get(date.format('YYYY-MM-DD')) ?? [];
    if (!items.length) return null;

    return (
      <ul className="event-calendar-list">
        {items.map((event) => {
          const meta = eventStatusMeta(event.status);
          return (
            <li key={event.id} title={`${event.name} · ${meta.text}`}>
              <Badge
                status={meta.badge}
                text={
                  <button
                    type="button"
                    className="event-calendar-item"
                    onClick={(click) => {
                      click.stopPropagation();
                      onEventOpen(event.id);
                    }}
                  >
                    {event.name}
                  </button>
                }
              />
            </li>
          );
        })}
      </ul>
    );
  };

  const monthCellRender = (date: Dayjs) => {
    const items = eventsByMonth.get(date.format('YYYY-MM')) ?? [];
    if (!items.length) return null;

    return <div className="event-calendar-month">{formatEventsCount(items.length)}</div>;
  };

  const cellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
    if (info.type === 'date') return dateCellRender(current);
    if (info.type === 'month') return monthCellRender(current);
    return info.originNode;
  };

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Card
        title={
          <Space size="middle" wrap>
            <Badge status="processing" text="Запланировано" />
            <Badge status="warning" text="В процессе" />
            <Badge status="success" text="Завершено" />
          </Space>
        }
      >
        <Calendar
          value={value}
          mode={mode}
          onSelect={(next, info) => {
            setValue(next);
            if (info.source === 'month') setMode('year');
            if (info.source === 'date') setMode('month');
          }}
          onPanelChange={(next, nextMode) => {
            setValue(next);
            setMode(nextMode);
          }}
          cellRender={cellRender}
        />
      </Card>

      <Card title={periodTitle(value, mode)}>
        {selectedEvents.length ? (
          <List
            dataSource={selectedEvents}
            renderItem={(event) => (
              <List.Item
                actions={[
                  <Button key="open" type="link" onClick={() => onEventOpen(event.id)}>
                    Открыть
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={event.name}
                  description={`${formatDateTime(event.eventDate)} · ${event.trackName}`}
                />
                {statusTag(event.status)}
              </List.Item>
            )}
          />
        ) : (
          <Empty
            description={
              mode === 'year' ? 'В этом месяце нет мероприятий' : 'В этот день нет мероприятий'
            }
          />
        )}
      </Card>
    </Space>
  );
}
