import { Button, DatePicker, Form, Input, InputNumber, Modal, Result, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { authService } from '../../../features/auth/authService';
import { eventsService } from '../../../features/events/eventsService';
import type { CreateEventRequest, EventTypeCode, SportCode } from '../../../shared/types/event';

type CreateEventFormValues = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: Dayjs;
  distanceKm?: number | null;
  description?: string;
  registrationOpen?: Dayjs | null;
  registrationClose?: Dayjs | null;
};

type FeedbackStatus = 'success' | 'unauthorized' | 'forbidden' | 'error';

type FeedbackState = {
  status: FeedbackStatus;
  title: string;
  subtitle?: string;
};

type CreateEventModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const eventTypeOptions = [
  { value: 'RACE', label: 'Гонка' },
  { value: 'TIME_TRIAL', label: 'Контрольная тренировка' },
];

const sportOptions = [
  { value: 'SKI', label: 'Лыжи' },
  { value: 'RUN', label: 'Бег' },
  { value: 'ROLLER_SKI', label: 'Лыжероллеры' },
  { value: 'BIKE', label: 'Велосипед' },
];

export function CreateEventModal({ open, onClose, onCreated }: CreateEventModalProps) {
  const [form] = Form.useForm<CreateEventFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        eventType: 'TIME_TRIAL',
        sport: 'SKI',
      });
    }
  }, [form, open]);

  const handleCancel = () => {
    if (submitting) return;
    form.resetFields();
    onClose();
  };

  const closeFeedback = () => {
    const wasSuccess = feedback?.status === 'success';
    setFeedback(null);
    if (wasSuccess) {
      form.resetFields();
      onClose();
      onCreated?.();
    }
  };

  const handleFinish = async (values: CreateEventFormValues) => {
    const payload: CreateEventRequest = {
      name: values.name.trim(),
      eventType: values.eventType,
      sport: values.sport,
      eventDate: values.eventDate.format('YYYY-MM-DD'),
    };
    if (values.distanceKm) payload.distanceKm = values.distanceKm;
    if (values.description?.trim()) payload.description = values.description.trim();
    if (values.registrationOpen) {
      payload.registrationOpen = values.registrationOpen.toDate().toISOString();
    }
    if (values.registrationClose) {
      payload.registrationClose = values.registrationClose.toDate().toISOString();
    }

    setSubmitting(true);
    try {
      const result = await eventsService.createEvent(payload);
      if (result.status === 201 || result.status === 200) {
        setFeedback({
          status: 'success',
          title: 'Мероприятие успешно создано',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось создать мероприятие',
        subtitle: `Неожиданный код ответа: ${result.status}`,
      });
    } catch (error) {
      const status = eventsService.getStatus(error);
      if (status === 401) {
        setFeedback({
          status: 'unauthorized',
          title: 'Неаутентифицирован',
          subtitle: 'Сессия недействительна или истекла. Войдите в систему ещё раз.',
        });
        return;
      }
      if (status === 403) {
        setFeedback({
          status: 'forbidden',
          title: 'Недостаточно прав',
          subtitle: 'Создавать мероприятия может администратор или организатор.',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось создать мероприятие',
        subtitle: eventsService.getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resultStatus =
    feedback?.status === 'success'
      ? 'success'
      : feedback?.status === 'unauthorized'
        ? 'warning'
        : feedback?.status === 'forbidden'
          ? '403'
          : 'error';

  return (
    <>
      <Modal
        title="Создать мероприятие"
        open={open}
        onCancel={handleCancel}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={submitting}>
            Отмена
          </Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={() => form.submit()}>
            Создать
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ eventType: 'TIME_TRIAL', sport: 'SKI' }}
          onFinish={handleFinish}
        >
          <Form.Item label="Трасса">
            <Input value="Алёшкино" disabled />
          </Form.Item>

          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: 'Укажите название' }]}
          >
            <Input placeholder="КТ Алёшкино" />
          </Form.Item>

          <Form.Item
            name="eventType"
            label="Тип"
            rules={[{ required: true, message: 'Выберите тип' }]}
          >
            <Select options={eventTypeOptions} />
          </Form.Item>

          <Form.Item
            name="sport"
            label="Вид спорта"
            rules={[{ required: true, message: 'Выберите вид спорта' }]}
          >
            <Select options={sportOptions} />
          </Form.Item>

          <Form.Item
            name="eventDate"
            label="Дата проведения"
            rules={[{ required: true, message: 'Укажите дату' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="distanceKm" label="Дистанция, км">
            <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} placeholder="10.5" />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Необязательно" />
          </Form.Item>

          <Form.Item name="registrationOpen" label="Открытие регистрации">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="registrationClose"
            label="Закрытие регистрации"
            dependencies={['registrationOpen']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value: Dayjs | null) {
                  const openAt = getFieldValue('registrationOpen') as Dayjs | null | undefined;
                  if (openAt && value && value.isBefore(openAt)) {
                    return Promise.reject(
                      new Error('Закрытие регистрации не может быть раньше открытия'),
                    );
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(feedback)}
        onCancel={closeFeedback}
        footer={
          feedback?.status === 'unauthorized'
            ? [
                <Button key="close" onClick={closeFeedback}>
                  Закрыть
                </Button>,
                <Button key="login" type="primary" onClick={() => authService.startLoginFlow()}>
                  Войти
                </Button>,
              ]
            : [
                <Button key="ok" type="primary" onClick={closeFeedback}>
                  Хорошо
                </Button>,
              ]
        }
      >
        {feedback ? (
          <Result status={resultStatus} title={feedback.title} subTitle={feedback.subtitle} />
        ) : null}
      </Modal>
    </>
  );
}
