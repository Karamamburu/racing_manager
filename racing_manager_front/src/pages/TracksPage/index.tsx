import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../shared/layout';
import type { TrackFilterOption } from '../../shared/types/tracks';
import { TracksFilters, TracksTable } from './components';

const cityOptions: TrackFilterOption[] = [{ value: 'all', label: 'Все города' }];
const sportOptions: TrackFilterOption[] = [{ value: 'all', label: 'Все дисциплины' }];

export function TracksPage() {
  const navigate = useNavigate();

  return (
    <AppShell
      title="Трассы"
      subtitle="Каталог маршрутов, фильтры и статус обслуживания"
      extra={
        <Button type="primary" icon={<PlusOutlined />}>
          Добавить трассу
        </Button>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <TracksFilters cityOptions={cityOptions} sportOptions={sportOptions} />
        <Empty description="Каталог трасс пока не подключен к серверу" />
        <TracksTable rows={[]} onBackClick={() => navigate('/')} />
      </Space>
    </AppShell>
  );
}
