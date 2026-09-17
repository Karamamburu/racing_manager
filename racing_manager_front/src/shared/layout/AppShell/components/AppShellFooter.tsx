import { Button, Layout, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { openCookiePreferences } from '../../../cookieConsent';

const { Footer } = Layout;

export function AppShellFooter() {
  const navigate = useNavigate();

  return (
    <Footer style={{ textAlign: 'center' }}>
      <div>Racing Manager Platform © 2026</div>
      <Space size="middle" style={{ marginTop: 8 }}>
        <Button type="link" onClick={() => navigate('/policy')} style={{ paddingInline: 0 }}>
          Политики
        </Button>
        <Button type="link" onClick={() => openCookiePreferences()} style={{ paddingInline: 0 }}>
          Настройки cookies
        </Button>
      </Space>
    </Footer>
  );
}
