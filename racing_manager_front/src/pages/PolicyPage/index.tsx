import { FileProtectOutlined } from '@ant-design/icons';
import { Card, List, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { AppShell } from '../../shared/layout';
import { policyDocuments } from './documents';

export function PolicyPage() {
  return (
    <AppShell
      title="Политики портала"
      subtitle="Документы об обработке данных и использовании cookies"
    >
      <Card>
        <Typography.Paragraph>
          Здесь будут опубликованы правовые документы Racing Manager. Тексты пока готовятся — вы
          можете открыть карточку нужного документа, а готовая редакция появится на этой же странице.
        </Typography.Paragraph>
        <List
          itemLayout="horizontal"
          dataSource={policyDocuments}
          renderItem={(document) => (
            <List.Item
              actions={[
                <Link key="open" to={`/policy/${document.slug}`}>
                  Открыть
                </Link>,
              ]}
            >
              <List.Item.Meta
                avatar={<FileProtectOutlined style={{ fontSize: 20 }} />}
                title={<Link to={`/policy/${document.slug}`}>{document.title}</Link>}
                description={document.description}
              />
            </List.Item>
          )}
        />
      </Card>
    </AppShell>
  );
}
