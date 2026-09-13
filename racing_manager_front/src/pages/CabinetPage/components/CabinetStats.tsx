import { ClockCircleTwoTone, FlagTwoTone, StarTwoTone, TrophyTwoTone } from '@ant-design/icons';
import { Card, Col, Row, Statistic } from 'antd';
import type { PersonalStats } from '../../../shared/types/personal';

type CabinetStatsProps = {
  stats: PersonalStats;
};

const emptyStats: PersonalStats = {
  starts: 0,
  wins: 0,
  podiums: 0,
  upcomingStarts: 0,
};

export function CabinetStats({ stats }: CabinetStatsProps) {
  const values = stats ?? emptyStats;

  return (
    <Card title="Статистика">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Statistic
            title="Участий в заездах"
            value={values.starts}
            prefix={<FlagTwoTone />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Statistic title="Побед" value={values.wins} prefix={<TrophyTwoTone />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Statistic title="Подиумов" value={values.podiums} prefix={<StarTwoTone />} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Statistic
            title="Ближайших стартов"
            value={values.upcomingStarts}
            prefix={<ClockCircleTwoTone />}
          />
        </Col>
      </Row>
    </Card>
  );
}
