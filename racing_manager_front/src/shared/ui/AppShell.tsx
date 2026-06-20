import {
  CarOutlined,
  CalendarOutlined,
  DashboardOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, Space, Typography } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import type { PropsWithChildren, ReactNode } from 'react';
import { authService } from '../../features/auth/authService';
import { useAuthStore } from '../../features/auth/authStore';

const { Header, Sider, Content, Footer } = Layout;

type AppShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  extra?: ReactNode;
}>;

const navItems = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: <Link to="/">Главная</Link>,
  },
  {
    key: '/cabinet',
    icon: <UserOutlined />,
    label: <Link to="/cabinet">Личный кабинет</Link>,
  },
  {
    key: 'calendar',
    icon: <CalendarOutlined />,
    label: 'Календарь',
    disabled: true,
  },
  {
    key: 'tracks',
    icon: <CarOutlined />,
    label: 'Трассы',
    disabled: true,
  },
  {
    key: 'cups',
    icon: <TrophyOutlined />,
    label: 'Очки и кубки',
    disabled: true,
  },
];

export function AppShell({ title, subtitle, extra, children }: AppShellProps) {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);

  const authAction =
    status === 'authenticated' ? (
      <Button onClick={() => authService.logout()}>Выйти</Button>
    ) : (
      <Button type="primary" onClick={() => authService.startLoginFlow()}>
        Войти
      </Button>
    );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" width={250}>
        <div className="app-logo">Racing Manager</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={navItems}
        />
      </Sider>

      <Layout>
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

        <Content className="app-content">{children}</Content>

        <Footer style={{ textAlign: 'center' }}>
          Racing Manager Platform © 2026
        </Footer>
      </Layout>
    </Layout>
  );
}
