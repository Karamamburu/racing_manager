import { UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Layout, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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

  const authAction = isAuthenticated ? null : (
    <>
      <Button onClick={() => authService.startRegistrationFlow()}>
        Создать учетную запись
      </Button>
      <Button type="primary" onClick={() => authService.startLoginFlow()}>
        Войти
      </Button>
    </>
  );

  return (
    <Header className="app-header">
      <div className="app-header-title">
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">{subtitle}</Typography.Text>
      </div>

      <Space size="middle" align="center" wrap className="app-header-actions">
        {extra}
        {authAction}
        <Link to="/cabinet" className="app-header-avatar" title="Личный кабинет" aria-label="Личный кабинет">
          <Avatar icon={<UserOutlined />} />
        </Link>
      </Space>
    </Header>
  );
}
