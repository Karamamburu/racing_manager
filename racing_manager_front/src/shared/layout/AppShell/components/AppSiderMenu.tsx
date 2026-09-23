import {
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  NotificationOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import { Link, useLocation } from 'react-router-dom';

const { Sider } = Layout;

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
    key: '/calendar',
    icon: <CalendarOutlined />,
    label: <Link to="/calendar">Календарь</Link>,
  },
  {
    key: '/news',
    icon: <NotificationOutlined />,
    label: <Link to="/news">Новости</Link>,
  },
  {
    key: '/tracks',
    icon: <CarOutlined />,
    label: <Link to="/tracks">Трассы</Link>,
  },
  {
    key: 'cups',
    icon: <TrophyOutlined />,
    label: 'Очки и кубки',
    disabled: true,
  },
];

function selectedMenuKey(pathname: string): string {
  if (pathname === '/') return '/';
  const match = navItems.find((item) => {
    if (item.key === '/' || item.key === 'cups') return false;
    return pathname === item.key || pathname.startsWith(`${item.key}/`);
  });
  return match?.key ?? pathname;
}

export function AppSiderMenu() {
  const location = useLocation();

  return (
    <Sider breakpoint="lg" collapsedWidth="0" theme="light" width={250}>
      <div className="app-logo">Racing Manager</div>
      <Menu theme="light" mode="inline" selectedKeys={[selectedMenuKey(location.pathname)]} items={navItems} />
    </Sider>
  );
}
