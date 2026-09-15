import { Button, Result } from 'antd';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../shared/layout';
import { findPolicyDocument } from './documents';

export function PolicyDocumentPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const document = findPolicyDocument(slug);

  if (!document) {
    return <Navigate to="/policy" replace />;
  }

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
