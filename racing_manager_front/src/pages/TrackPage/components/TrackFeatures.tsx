import { Card, Descriptions } from 'antd';
import type { TrackFeature } from '../../../shared/types/track';

type TrackFeaturesProps = {
  features: TrackFeature[];
};

export function TrackFeatures({ features }: TrackFeaturesProps) {
  return (
    <Card title="Характеристики трассы">
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
        {features.map((feature) => (
          <Descriptions.Item key={feature.key} label={feature.title}>
            {feature.value}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Card>
  );
}
