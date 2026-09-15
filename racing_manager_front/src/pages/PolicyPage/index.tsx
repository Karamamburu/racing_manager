import { FileProtectOutlined } from '@ant-design/icons';
import { Card, List, Tag, Typography } from 'antd';
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
          Здесь публикуются правовые документы Racing Manager: политика конфиденциальности, политика
          использования файлов cookie и согласие на обработку персональных данных.
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
                title={
                  <span>
                    <Link to={`/policy/${document.slug}`}>{document.title}</Link>{' '}
                    <Tag color={document.published ? 'green' : 'default'}>
                      {document.published ? 'Опубликовано' : 'Готовится'}
                    </Tag>
                  </span>
                }
                description={document.description}
              />
            </List.Item>
          )}
        />
      </Card>
    </AppShell>
  );
}
