import { Button, Card, Result } from 'antd';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../shared/layout';
import { CookiesPolicyContent } from './CookiesPolicyContent';
import { findPolicyDocument } from './documents';
import { PersonalDataConsentContent } from './PersonalDataConsentContent';
import { PrivacyPolicyContent } from './PrivacyPolicyContent';

export function PolicyDocumentPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const document = findPolicyDocument(slug);

  if (!document) {
    return <Navigate to="/policy" replace />;
  }

  if (!document.published) {
    return (
      <AppShell title={document.title} subtitle="Документ готовится к публикации">
        <Result
          status="info"
          title={document.title}
          subTitle="Текст этой политики пока не опубликован. Готовая редакция появится на этой странице."
          extra={
            <Button type="primary" onClick={() => navigate('/policy')}>
              Ко всем политикам
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={document.title} subtitle="Правовой документ портала «Все на старт»">
      <Card>
        {document.slug === 'cookies' ? <CookiesPolicyContent /> : null}
        {document.slug === 'privacy' ? <PrivacyPolicyContent /> : null}
        {document.slug === 'personal-data' ? <PersonalDataConsentContent /> : null}
        <Button type="link" onClick={() => navigate('/policy')} style={{ paddingInline: 0 }}>
          Ко всем политикам
        </Button>
      </Card>
    </AppShell>
  );
}
