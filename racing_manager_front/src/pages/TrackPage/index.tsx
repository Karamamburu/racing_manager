import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../shared/layout';

export function TrackPage() {
  const navigate = useNavigate();

  return (
    <AppShell title="Трасса не найдена" subtitle="Проверьте ссылку или выберите трассу из каталога">
      <Result
        status="404"
        title="Трасса не найдена"
        subTitle="Для указанного id нет данных о трассе."
        extra={
          <Button type="primary" onClick={() => navigate('/tracks')}>
            К списку трасс
          </Button>
        }
      />
    </AppShell>
  );
}
