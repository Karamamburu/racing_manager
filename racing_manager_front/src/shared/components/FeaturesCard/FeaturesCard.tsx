import { Card, Descriptions, theme } from 'antd';
import type { FeatureItem } from '../../types/track';

type FeaturesCardProps = {
  features: FeatureItem[];
  title?: string;
};

export function FeaturesCard({ features, title = 'Характеристики' }: FeaturesCardProps) {
  const { token } = theme.useToken();

  return (
    <Card title={title}>
      <Descriptions
        bordered
        colon={false}
        layout="vertical"
        size="middle"
        column={{ xs: 1, sm: 2, lg: 3 }}
        styles={{
          label: {
            fontWeight: 600,
            color: token.colorText,
            background: token.colorFillAlter,
          },
          content: {
            fontSize: token.fontSizeLG,
          },
        }}
        items={features.map((feature) => ({
          key: feature.key,
          label: feature.title,
          children: feature.value,
        }))}
      />
    </Card>
  );
}
