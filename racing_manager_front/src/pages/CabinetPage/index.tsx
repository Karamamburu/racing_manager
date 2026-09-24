import {
  Button,
  Card,
  Descriptions,
  Empty,
  Result,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../features/auth/authService';
import { personalQueryKey, usePersonalQuery } from '../../features/auth/usePersonalQuery';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { AppShell } from '../../shared/layout';
import { CabinetStats, EditProfileModal } from './components';

const genderLabels: Record<string, string> = {
  M: 'Мужской',
  F: 'Женский',
};

export function CabinetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const isAuthenticated = Boolean(sessionQuery.data?.authenticated);
  const personalQuery = usePersonalQuery({ enabled: isAuthenticated });
  const [editOpen, setEditOpen] = useState(false);

  if (sessionQuery.isLoading || (isAuthenticated && personalQuery.isLoading)) {
    return (
      <AppShell title="Личный кабинет" subtitle="Загружаем персональные данные...">
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
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

  if (personalQuery.isError) {
    return (
      <AppShell title="Личный кабинет" subtitle="Не удалось загрузить данные профиля">
        <Result
          status="error"
          title="Не удалось загрузить профиль"
          subTitle="Сессия есть, но персональные данные сейчас недоступны. Попробуйте обновить страницу."
          extra={[
            <Button key="retry" type="primary" onClick={() => personalQuery.refetch()}>
              Повторить
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

  const { user, profile, roles } = data;
  const fullName =
    user.name ??
    ([profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
      'Участник');

  return (
    <AppShell
      title="Личный кабинет"
      subtitle="Персональные данные пользователя"
      extra={
        <Button type="primary" onClick={() => setEditOpen(true)}>
          Редактировать профиль
        </Button>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>

        <CabinetStats
          stats={
            data.stats ?? {
              starts: 0,
              wins: 0,
              podiums: 0,
              upcomingStarts: 0,
            }
          }
        />

        <Card title="Профиль">
          <Typography.Title level={4} style={{ marginTop: 0 }}>
            {fullName}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
            {user.email ?? profile?.email ?? 'Email не указан'}
          </Typography.Paragraph>

          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Username">{user.username ?? profile?.userName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Роли">
              {roles?.length ? roles.join(', ') : 'участник'}
            </Descriptions.Item>
            <Descriptions.Item label="Имя">{profile?.firstName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Фамилия">{profile?.lastName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{profile?.email ?? user.email ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Пол">
              {profile?.gender ? (genderLabels[profile.gender] ?? profile.gender) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Дата рождения">{profile?.birthDate ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Город">{profile?.city ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Район">{profile?.district ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Команда">{profile?.team ?? '—'}</Descriptions.Item>
          </Descriptions>
        </Card>

        {!profile && (
          <Card>
            <Empty description="Профиль в базе пока не заполнен" />
          </Card>
        )}
      </Space>

      <EditProfileModal
        open={editOpen}
        profile={profile}
        username={user.username ?? profile?.userName}
        email={user.email ?? profile?.email}
        onClose={() => setEditOpen(false)}
        onUpdated={() => {
          void queryClient.invalidateQueries({ queryKey: personalQueryKey });
        }}
      />
    </AppShell>
  );
}
