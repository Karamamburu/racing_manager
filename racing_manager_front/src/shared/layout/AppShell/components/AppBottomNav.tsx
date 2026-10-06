import { CalendarOutlined, HomeOutlined, ReadOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const items: { to: string; end?: boolean; icon: ReactNode; label: string }[] = [
  { to: '/', end: true, icon: <HomeOutlined />, label: 'Главная' },
  { to: '/calendar', icon: <CalendarOutlined />, label: 'Календарь' },
  { to: '/news', icon: <ReadOutlined />, label: 'Новости' },
];

export function AppBottomNav() {
  return (
    <nav className="app-bottom-nav" aria-label="Основная навигация">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            isActive ? 'app-bottom-nav__item app-bottom-nav__item--active' : 'app-bottom-nav__item'
          }
        >
          <span className="app-bottom-nav__icon">{item.icon}</span>
          <span className="app-bottom-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
