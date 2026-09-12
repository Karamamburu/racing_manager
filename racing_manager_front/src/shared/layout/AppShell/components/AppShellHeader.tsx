import { UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Layout, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { authService } from '../../../../features/auth/authService';
import { useSessionQuery } from '../../../../features/auth/useSessionQuery';

const { Header } = Layout;

type AppShellHeaderProps = {
  title: string;
  subtitle: string;
  extra?: ReactNode;
};

export function AppShellHeader({ title, subtitle, extra }: AppShellHeaderProps) {
  const sessionQuery = useSessionQuery();
  const isAuthenticated = Boolean(sessionQuery.data?.authenticated);

  const authAction = isAuthenticated ? (
    <Button onClick={() => authService.logout()}>Выйти</Button>
  ) : (
    <Button type="primary" onClick={() => authService.startLoginFlow()}>
      Войти
    </Button>
  );

  return (
    <Header className="app-header">
      <Space size="middle" align="center">
        <Avatar icon={<UserOutlined />} />
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          <Typography.Text type="secondary">{subtitle}</Typography.Text>
        </div>
      </Space>

      <Space>
        {extra}
        {authAction}
      </Space>
    </Header>
  );
}
