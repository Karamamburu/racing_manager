import { Card, Descriptions } from 'antd';
import type { FeatureItem } from '../../types/track';

type FeaturesCardProps = {
  features: FeatureItem[];
  title?: string;
};

export function FeaturesCard({ features, title = 'Характеристики' }: FeaturesCardProps) {
  return (
    <Card title={title}>
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
