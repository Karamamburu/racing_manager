import { Card, Col, Row, Statistic } from 'antd';
import type { TracksStat } from '../../types/tracks';

type MetricStatsProps = {
  stats: TracksStat[];
};

export function MetricStats({ stats }: MetricStatsProps) {
  return (
    <Row gutter={[16, 16]}>
      {stats.map((stat) => (
        <Col key={stat.key} xs={24} md={12} lg={6}>
          <Card>
            <Statistic title={stat.title} value={stat.value} suffix={stat.suffix} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
