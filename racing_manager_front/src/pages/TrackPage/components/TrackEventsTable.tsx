import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TrackEventRow } from '../../../shared/types/track';

type TrackEventsTableProps = {
  events: TrackEventRow[];
  onEventClick?: (event: TrackEventRow) => void;
};

function getEventsColumns(onEventClick?: (event: TrackEventRow) => void): ColumnsType<TrackEventRow> {
  return [
    {
      title: 'Мероприятие',
      dataIndex: 'event',
      key: 'event',
      render: (event: string, record) =>
        onEventClick ? (
          <a onClick={() => onEventClick(record)}>{event}</a>
        ) : (
          event
        ),
    },
    { title: 'Тип', dataIndex: 'type', key: 'type' },
    { title: 'Дата', dataIndex: 'date', key: 'date' },
    { title: 'Участники', dataIndex: 'participants', key: 'participants' },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: TrackEventRow['status']) =>
        status === 'DONE' ? <Tag color="green">DONE</Tag> : <Tag color="blue">PLANNED</Tag>,
    },
  ];
}

export function TrackEventsTable({ events, onEventClick }: TrackEventsTableProps) {
  return (
    <Card title="Проведённые и запланированные мероприятия">
      <Table columns={getEventsColumns(onEventClick)} dataSource={events} pagination={false} />
    </Card>
  );
}
