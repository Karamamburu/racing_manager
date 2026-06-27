import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TrackEventRow } from '../../../shared/types/track';

type TrackEventsTableProps = {
  events: TrackEventRow[];
};

const eventsColumns: ColumnsType<TrackEventRow> = [
  { title: 'Мероприятие', dataIndex: 'event', key: 'event' },
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

export function TrackEventsTable({ events }: TrackEventsTableProps) {
  return (
    <Card title="Проведённые и запланированные мероприятия">
      <Table columns={eventsColumns} dataSource={events} pagination={false} />
    </Card>
  );
}
