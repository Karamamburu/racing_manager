import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Result,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { authService } from '../features/auth/authService';
import { usePersonalQuery } from '../features/auth/usePersonalQuery';
import { AppShell } from '../shared/ui/AppShell';

type RaceRow = {
  key: string;
  event: string;
  place: number;
  time: string;
  status: 'FINISHED' | 'REGISTERED' | 'DNS';
};

const raceColumns: ColumnsType<RaceRow> = [
  { title: 'Событие', dataIndex: 'event', key: 'event' },
  { title: 'Место', dataIndex: 'place', key: 'place' },
  { title: 'Время', dataIndex: 'time', key: 'time' },
  {
    title: 'Статус',
    dataIndex: 'status',
    key: 'status',
    render: (status: RaceRow['status']) => {
      if (status === 'FINISHED') return <Tag color="green">FINISHED</Tag>;
      if (status === 'REGISTERED') return <Tag color="blue">REGISTERED</Tag>;
      return <Tag color="red">DNS</Tag>;
    },
  },
];

const races: RaceRow[] = [
  { key: '1', event: 'Winter Sprint', place: 2, time: '00:32:14', status: 'FINISHED' },
  { key: '2', event: 'City Trail', place: 5, time: '01:12:44', status: 'FINISHED' },
  {
    key: '3',
    event: 'Forest Marathon',
    place: 0,
    time: '—',
    status: 'REGISTERED',
  },
];

export function CabinetPage() {
  const navigate = useNavigate();
  const personalQuery = usePersonalQuery();

  if (personalQuery.isLoading) {
    return (
      <AppShell title="Личный кабинет" subtitle="Загружаем персональные данные...">
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </AppShell>
    );
  }

  if (personalQuery.isError) {
    return (
      <AppShell title="Личный кабинет" subtitle="Не удалось загрузить данные профиля">
        <Result
          status="warning"
          title="Похоже, вы не авторизованы"
          subTitle="Для просмотра профиля необходимо выполнить вход через backend-аутентификацию."
          extra={[
            <Button key="login" type="primary" onClick={() => authService.startLoginFlow()}>
              Войти
            </Button>,
            <Button key="home" onClick={() => navigate('/')}>
              На главную
            </Button>,
          ]}
        />
      </AppShell>
    );
  }

  const data = personalQuery.data;
  if (!data) {
    return (
      <AppShell title="Личный кабинет" subtitle="Данные профиля отсутствуют">
        <Result
          status="info"
          title="Профиль пока недоступен"
          extra={
            <Button type="primary" onClick={() => navigate('/')}>
              На главную
            </Button>
          }
        />
      </AppShell>
    );
  }

  const { user, profile } = data;
  const fullName =
    user.name ??
    ([profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
      'Участник');

  return (
    <AppShell
      title="Личный кабинет"
      subtitle="Профиль спортсмена и краткая статистика"
      extra={<Button onClick={() => navigate('/')}>На главную</Button>}
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Сессия активна"
          description="Профиль загружен из backend endpoint /personal на основе текущей серверной сессии."
        />

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Card title="Профиль">
              <Typography.Title level={4} style={{ marginTop: 0 }}>
                {fullName}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
                {user.email ?? profile?.email ?? 'Email не указан'}
              </Typography.Paragraph>

              <Descriptions bordered column={1} size="small">
                <Descriptions.Item label="Username">
                  {user.username ?? profile?.userName ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Город">{profile?.city ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Пол">{profile?.gender ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Дата рождения">{profile?.birthDate ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Рост">{profile?.lengthCm ? `${profile.lengthCm} см` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Вес">{profile?.weightKg ? `${profile.weightKg} кг` : '—'}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} lg={14}>
            <Row gutter={[16, 16]}>
              <Col xs={12}>
                <Card>
                  <Statistic title="Гонок" value={12} />
                </Card>
              </Col>
              <Col xs={12}>
                <Card>
                  <Statistic title="Побед" value={5} />
                </Card>
              </Col>
              <Col xs={12}>
                <Card>
                  <Statistic title="Очков" value={340} />
                </Card>
              </Col>
              <Col xs={12}>
                <Card>
                  <Statistic title="Кубков" value={3} />
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>

        <Card title="История гонок">
          <Table columns={raceColumns} dataSource={races} pagination={false} />
        </Card>

        {!profile && (
          <Card>
            <Empty description="Профиль в базе пока не заполнен" />
          </Card>
        )}
      </Space>
    </AppShell>
  );
}
