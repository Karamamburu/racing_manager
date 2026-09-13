import {
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
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

export function AppSiderMenu() {
  const location = useLocation();

  return (
    <Sider breakpoint="lg" collapsedWidth="0" width={250}>
      <div className="app-logo">Racing Manager</div>
      <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={navItems} />
    </Sider>
  );
}
