import { Avatar, Button, Card, Progress, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SportDiscipline, TrackRow } from '../../../shared/types/tracks';

type TracksTableProps = {
  rows: TrackRow[];
  onBackClick: () => void;
};

function getDisciplineColor(discipline: SportDiscipline) {
  if (discipline === 'Бег') return 'cyan';
  if (discipline === 'Лыжи') return 'blue';
  return 'purple';
}

const trackColumns: ColumnsType<TrackRow> = [
  {
    title: 'Трасса',
    dataIndex: 'track',
    key: 'track',
    render: (track: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{track}</Typography.Text>
        <Typography.Text type="secondary">{record.city}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Дисциплина',
    dataIndex: 'discipline',
    key: 'discipline',
    render: (discipline: TrackRow['discipline']) => (
      <Tag color={getDisciplineColor(discipline)}>{discipline}</Tag>
    ),
  },
  { title: 'Длина', dataIndex: 'length', key: 'length' },
  { title: 'Обновлено', dataIndex: 'updatedAt', key: 'updatedAt' },
  {
    title: 'Менеджер',
    dataIndex: 'manager',
    key: 'manager',
    render: (manager: string) => (
      <Space size={10}>
        <Avatar>{manager.split(' ').map((chunk) => chunk[0]).join('')}</Avatar>
        <Typography.Text>{manager}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Загрузка',
    dataIndex: 'load',
    key: 'load',
    render: (load: number) => (
      <Progress
        percent={load}
        size="small"
        strokeColor={load > 80 ? '#fa8c16' : '#1677ff'}
      />
    ),
  },
];

export function TracksTable({ rows, onBackClick }: TracksTableProps) {
  return (
    <Card
      title="Трассы в работе"
      extra={
        <Button type="link" onClick={onBackClick}>
          Вернуться на главную
        </Button>
      }
    >
      <Table columns={trackColumns} dataSource={rows} pagination={false} />
    </Card>
  );
}
