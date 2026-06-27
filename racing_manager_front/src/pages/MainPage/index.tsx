import {
  ArrowRightOutlined,
  CheckCircleTwoTone,
  ClockCircleTwoTone,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Carousel,
  Col,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMainDashboardQuery } from '../../features/main/useMainDashboardQuery';
import { AppShell } from '../../shared/layout';
import type { MainEventRow, MainSlide, MainStat } from '../../shared/types/main';

const eventColumns: ColumnsType<MainEventRow> = [
  { title: 'Событие', dataIndex: 'event', key: 'event' },
  { title: 'Дата', dataIndex: 'date', key: 'date' },
  {
    title: 'Статус',
    dataIndex: 'status',
    key: 'status',
    render: (status: MainEventRow['status']) =>
      status === 'DONE' ? <Tag color="green">DONE</Tag> : <Tag color="blue">PLANNED</Tag>,
  },
  { title: 'Трасса', dataIndex: 'track', key: 'track' },
];

const statPrefixes: Record<string, ReactNode> = {
  'upcoming-races': <ClockCircleTwoTone />,
  'active-tracks': <CheckCircleTwoTone twoToneColor="#52c41a" />,
};

export function MainPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMainDashboardQuery();

  if (isLoading) {
    return (
      <AppShell title="Панель управления" subtitle="Сводка по соревнованиям, трассам и активности участников">
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Card>
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        </Space>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell title="Панель управления" subtitle="Сводка по соревнованиям, трассам и активности участников">
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить данные главной страницы"
          description="Попробуйте обновить данные. Сейчас используется имитация серверного запроса."
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Повторить
            </Button>
          }
        />
      </AppShell>
    );
  }

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
          {data.slides.map((slide: MainSlide) => (
            <div key={slide.key}>
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
          {data.stats.map((stat: MainStat) => (
            <Col key={stat.key} xs={24} md={8}>
              <Card>
                <Statistic
                  title={stat.title}
                  value={stat.value}
                  suffix={stat.suffix}
                  prefix={statPrefixes[stat.key]}
                />
                {stat.actionLabel ? (
                  <Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/cabinet')}>
                    {stat.actionLabel}
                  </Button>
                ) : (
                  <Typography.Text type="secondary">{stat.description}</Typography.Text>
                )}
              </Card>
            </Col>
          ))}
        </Row>

        <Card title="Последние события">
          <Table columns={eventColumns} dataSource={data.events} pagination={false} />
        </Card>
      </Space>
    </AppShell>
  );
}
