import { Layout } from 'antd';
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '../../../cookieConsent';

const { Footer } = Layout;

export function AppShellFooter() {
  return (
    <Footer className="app-footer">
      <div>Все на гонку © 2026</div>
      <div className="app-footer-links">
        <Link to="/policy">Политики</Link>
        <button type="button" onClick={() => openCookiePreferences()}>
          Настройки cookies
        </button>
      </div>
    </Footer>
  );
}
