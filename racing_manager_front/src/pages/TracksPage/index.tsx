import { PlusOutlined } from '@ant-design/icons';
import { Button, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  cityOptionsMock,
  sportOptionsMock,
  trackCardsMock,
  trackRowsMock,
  trackStatsMock,
} from '../../mocks/tracks';
import { AppShell } from '../../shared/layout';
import { TracksCards, TracksFilters, TracksStats, TracksTable } from './components';

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
        <TracksStats stats={trackStatsMock} />
        <TracksFilters cityOptions={cityOptionsMock} sportOptions={sportOptionsMock} />
        <TracksCards tracks={trackCardsMock} />
        <TracksTable rows={trackRowsMock} onBackClick={() => navigate('/')} />
      </Space>
    </AppShell>
  );
}
