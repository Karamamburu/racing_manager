import { EnvironmentOutlined } from '@ant-design/icons';
import { Badge, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { SportDiscipline, TrackCardItem } from '../../../shared/types/tracks';

type TracksCardsProps = {
  tracks: TrackCardItem[];
};

function getDisciplineColor(discipline: SportDiscipline) {
  if (discipline === 'Бег') return 'cyan';
  if (discipline === 'Лыжи') return 'blue';
  if (discipline === 'Лыжероллеры') return 'purple';
  if (discipline === 'Велосипед') return 'red';
  return 'purple';
}

export function TracksCards({ tracks }: TracksCardsProps) {
  const navigate = useNavigate();

  return (
    <Row gutter={[16, 16]}>
      {tracks.map((track) => (
        <Col key={track.key} xs={24} md={12} xl={8}>
          <Card
            hoverable
            onClick={() => navigate(`/tracks/${track.key}`)}
            cover={
              <img
                src={track.image}
                alt={track.name}
                style={{ height: 170, objectFit: 'cover' }}
              />
            }
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {track.name}
                </Typography.Title>
                <Badge
                  status={track.status === 'OPEN' ? 'success' : 'warning'}
                  text={track.status === 'OPEN' ? 'Открыта' : 'В разработке'}
                />
              </Space>

              <Space size={6}>
                <EnvironmentOutlined />
                <Typography.Text type="secondary">
                  {track.city} - {track.region}
                </Typography.Text>
              </Space>

              <Space wrap>
                {track.sports.map((sport) => (
                  <Tag key={sport} color={getDisciplineColor(sport)}>
                    {sport}
                  </Tag>
                ))}
                <Tag>{track.distanceKm} км</Tag>
              </Space>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
