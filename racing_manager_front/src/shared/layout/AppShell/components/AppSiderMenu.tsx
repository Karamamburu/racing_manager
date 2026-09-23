import {
  CalendarOutlined,
  HomeOutlined,
  NodeIndexOutlined,
  ReadOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const { Sider } = Layout;

const siderCollapsedWidth = 80;
const siderExpandedWidth = 250;

const navItems = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: <Link to="/">Главная</Link>,
    title: '',
  },
  {
    key: '/cabinet',
    icon: <UserOutlined />,
    label: <Link to="/cabinet">Личный кабинет</Link>,
    title: '',
  },
  {
    key: '/calendar',
    icon: <CalendarOutlined />,
    label: <Link to="/calendar">Календарь</Link>,
    title: '',
  },
  {
    key: '/news',
    icon: <ReadOutlined />,
    label: <Link to="/news">Новости</Link>,
    title: '',
  },
  {
    key: '/tracks',
    icon: <NodeIndexOutlined />,
    label: <Link to="/tracks">Трассы</Link>,
    title: '',
  },
  {
    key: 'cups',
    icon: <TrophyOutlined />,
    label: 'Очки и кубки',
    title: '',
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
  const [collapsed, setCollapsed] = useState(true);
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  const expand = () => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    setCollapsed(false);
  };

  const collapse = () => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setCollapsed(true), 80);
  };

  return (
    <div className="app-sider-slot">
      <Sider
        className="app-sider"
        collapsed={collapsed}
        collapsedWidth={siderCollapsedWidth}
        width={siderExpandedWidth}
        theme="light"
        trigger={null}
        onMouseEnter={expand}
        onMouseLeave={collapse}
        onFocus={expand}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          collapse();
        }}
      >
        <div className="app-logo" title="Все на старт">
          {collapsed ? 'Старт' : 'Все на старт'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedMenuKey(location.pathname)]}
          items={navItems}
        />
      </Sider>
    </div>
  );
}
