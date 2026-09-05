import { Button, Result, Space } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackResponseMockById } from '../../mocks/track';
import { FeaturesCard, MetricStats, PromoSlider } from '../../shared/components';
import { AppShell } from '../../shared/layout';
import { TrackEventsTable } from './components';

export function TrackPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const trackData = id ? getTrackResponseMockById(id) : undefined;

  if (!trackData) {
    return (
      <AppShell title="Трасса не найдена" subtitle="Проверьте ссылку или выберите трассу из каталога">
        <Result
          status="404"
          title="Трасса не найдена"
          subTitle="Для указанного id нет моковых данных."
          extra={
            <Button type="primary" onClick={() => navigate('/tracks')}>
              К списку трасс
            </Button>
          }
        />
      </AppShell>
    );
  }

  const trackId = id as string;

  return (
    <AppShell
      title={trackData.title}
      subtitle={trackData.subtitle}
      extra={
        <Button type="default" onClick={() => navigate('/tracks')}>
          К списку трасс
        </Button>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <MetricStats stats={trackData.stats} />
        <PromoSlider slides={trackData.slides} />
        <FeaturesCard title="Характеристики трассы" features={trackData.features} />
        <TrackEventsTable
          events={trackData.events}
          onEventClick={(event) => navigate(`/events/${trackId}_${event.key}`)}
        />
      </Space>
    </AppShell>
  );
}
