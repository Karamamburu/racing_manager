import { Button, Card, Form, Input, InputNumber, Modal, Result, Select, Space, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getEventResponseMockById } from '../../mocks/event';
import { FeaturesCard } from '../../shared/components';
import { AppShell } from '../../shared/layout';
import type {
  EventRegistration,
  EventRegistrationFormValues,
} from '../../shared/types/event';

const wheelTypeOptions = [
  { value: 'Быстрые', label: 'Быстрые' },
  { value: 'Медленные', label: 'Медленные' },
  { value: 'Классика', label: 'Классика' },
];

const registeredUsersColumns: ColumnsType<EventRegistration> = [
  { title: 'Стартовый номер', dataIndex: 'startNumber', key: 'startNumber', width: 140 },
  { title: 'ФИО', dataIndex: 'fullName', key: 'fullName' },
  { title: 'Год рождения', dataIndex: 'birthYear', key: 'birthYear' },
  { title: 'Тип колёс', dataIndex: 'wheelType', key: 'wheelType' },
  { title: 'Команда', dataIndex: 'team', key: 'team' },
  { title: 'Район', dataIndex: 'district', key: 'district' },
];

export function EventPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const eventData = id ? getEventResponseMockById(id) : undefined;
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<EventRegistration[]>(
    eventData?.registeredUsers ?? [],
  );
  const [form] = Form.useForm<EventRegistrationFormValues>();

  if (!eventData) {
    return (
      <AppShell title="Мероприятие не найдено" subtitle="Проверьте ссылку или откройте событие из карточки трассы">
        <Result
          status="404"
          title="Мероприятие не найдено"
          subTitle="Для указанного id нет моковых данных."
          extra={
            <Button type="primary" onClick={() => navigate('/tracks')}>
              К списку трасс
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={eventData.title}
      subtitle={eventData.subtitle}
      extra={
        <Button type="default" onClick={() => navigate(-1)}>
          Назад
        </Button>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Card>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {eventData.title}
          </Typography.Title>
        </Card>

        <FeaturesCard title="Характеристики мероприятия" features={eventData.features} />

        <Card title="Описание мероприятия">
          {eventData.descriptionParagraphs.map((paragraph) => (
            <Typography.Paragraph key={paragraph}>{paragraph}</Typography.Paragraph>
          ))}
          <Typography.Link href={eventData.mapLink} target="_blank" rel="noreferrer">
            Открыть карту гонки
          </Typography.Link>
        </Card>

        <Button
          type="primary"
          size="large"
          onClick={() => {
            form.setFieldsValue(eventData.registrationFormInitial);
            setIsRegistrationModalOpen(true);
          }}
        >
          Зарегистрироваться
        </Button>

        <Card title="Зарегистрированные участники">
          <Table
            columns={registeredUsersColumns}
            dataSource={registeredUsers}
            rowKey={(record) => `${record.startNumber}-${record.fullName}-${record.birthYear}`}
            pagination={false}
          />
        </Card>
      </Space>

      <Modal
        title="Форма регистрации (таблица registrations)"
        open={isRegistrationModalOpen}
        onCancel={() => setIsRegistrationModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsRegistrationModalOpen(false)}>
            Закрыть
          </Button>,
          <Button key="submit" type="primary" onClick={() => form.submit()}>
            Подать заявку
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={eventData.registrationFormInitial}
          onFinish={(values) => {
            setRegisteredUsers((prev) => [...prev, { ...values, startNumber: 'TBD' }]);
            message.success('Участник добавлен. Стартовый номер будет назначен сотрудником трассы.');
            setIsRegistrationModalOpen(false);
            form.resetFields();
          }}
        >
          <Form.Item name="fullName" label="ФИО" rules={[{ required: true, message: 'Укажите ФИО' }]}>
            <Input placeholder="Фамилия Имя" />
          </Form.Item>

          <Form.Item
            name="birthYear"
            label="Год рождения"
            rules={[{ required: true, message: 'Укажите год рождения' }]}
          >
            <InputNumber min={1940} max={new Date().getFullYear()} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="wheelType" label="Тип колёс" rules={[{ required: true, message: 'Выберите тип колёс' }]}>
            <Select options={wheelTypeOptions} />
          </Form.Item>

          <Form.Item name="team" label="Команда" rules={[{ required: false, message: 'Укажите команду' }]}>
            <Input placeholder="Название команды" />
          </Form.Item>

          <Form.Item name="district" label="Район" rules={[{ required: false, message: 'Укажите район' }]}>
            <Input placeholder="Откуда участник" />
          </Form.Item>
        </Form>
      </Modal>
    </AppShell>
  );
}
