import { Card, Descriptions, theme } from 'antd';
import type { DescriptionsProps } from 'antd';
import type { ReactNode } from 'react';
import type { FeatureItem } from '../../types/track';

type FeaturesCardProps = {
  features: FeatureItem[];
  title?: string;
  extra?: ReactNode;
  column?: DescriptionsProps['column'];
};

export function FeaturesCard({
  features,
  title = 'Характеристики',
  extra,
  column = { xs: 1, sm: 2, lg: 3 },
}: FeaturesCardProps) {
  const { token } = theme.useToken();

  return (
    <Card title={title} extra={extra}>
      <Descriptions
        bordered
        colon={false}
        layout="vertical"
        size="middle"
        column={column}
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
