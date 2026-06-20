import {
  ArrowRightOutlined,
  CheckCircleTwoTone,
  ClockCircleTwoTone,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Carousel,
  Col,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../shared/ui/AppShell';

type EventRow = {
  key: string;
  event: string;
  date: string;
  status: 'PLANNED' | 'DONE';
  track: string;
};

const eventColumns: ColumnsType<EventRow> = [
  { title: 'Событие', dataIndex: 'event', key: 'event' },
  { title: 'Дата', dataIndex: 'date', key: 'date' },
  {
    title: 'Статус',
    dataIndex: 'status',
    key: 'status',
    render: (status: EventRow['status']) =>
      status === 'DONE' ? <Tag color="green">DONE</Tag> : <Tag color="blue">PLANNED</Tag>,
  },
  { title: 'Трасса', dataIndex: 'track', key: 'track' },
];

const eventRows: EventRow[] = [
  {
    key: '1',
    event: 'Winter Sprint Cup',
    date: '2026-01-20',
    status: 'PLANNED',
    track: 'Alpine Track',
  },
  {
    key: '2',
    event: 'Trail Marathon',
    date: '2026-02-10',
    status: 'DONE',
    track: 'Forest Loop',
  },
  {
    key: '3',
    event: 'City League Open',
    date: '2026-03-03',
    status: 'PLANNED',
    track: 'City Rings',
  },
];

const slides = [
  {
    title: 'Зимние соревнования 2026',
    subtitle: 'Подготовка и регистрация команд открыта до 15 января.',
    image:
      'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1400&q=80',
  },
  {
    title: 'Новые трассы сезона',
    subtitle: 'Добавлены 4 новых маршрута с уровнем сложности Expert.',
    image:
      'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=1400&q=80',
  },
  {
    title: 'Кубок региона',
    subtitle: 'Актуальные результаты и онлайн-обновление очков участников.',
    image:
      'https://images.unsplash.com/photo-1502904550040-7534597429ae?auto=format&fit=crop&w=1400&q=80',
  },
];

export function MainPage() {
  const navigate = useNavigate();

  return (
    <AppShell
      title="Панель управления"
      subtitle="Сводка по соревнованиям, трассам и активности участников"
      extra={
        <Button type="default" onClick={() => navigate('/cabinet')}>
          Личный кабинет
        </Button>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Carousel autoplay draggable>
          {slides.map((slide) => (
            <div key={slide.title}>
              <div
                className="hero-slide"
                style={{
                  backgroundImage: `linear-gradient(120deg, rgba(8, 21, 45, 0.85), rgba(24, 144, 255, 0.35)), url(${slide.image})`,
                }}
              >
                <Typography.Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
                  {slide.title}
                </Typography.Title>
                <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                  {slide.subtitle}
                </Typography.Paragraph>
              </div>
            </div>
          ))}
        </Carousel>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="Ближайшие гонки" value={8} prefix={<ClockCircleTwoTone />} />
              <Typography.Text type="secondary">Регистрации открыты, 2 гонки почти заполнены.</Typography.Text>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card>
              <Statistic title="Активные трассы" value={14} prefix={<CheckCircleTwoTone twoToneColor="#52c41a" />} />
              <Typography.Text type="secondary">10 трасс доступны круглый год, 4 сезонные.</Typography.Text>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card>
              <Statistic title="Кубковые сезоны" value={3} suffix="в работе" />
              <Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/cabinet')}>
                Посмотреть мой прогресс
              </Button>
            </Card>
          </Col>
        </Row>

        <Card title="Последние события">
          <Table columns={eventColumns} dataSource={eventRows} pagination={false} />
        </Card>
      </Space>
    </AppShell>
  );
}
