import { Button, DatePicker, Form, Input, InputNumber, Modal, Result, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { authService } from '../../../features/auth/authService';
import { eventsService } from '../../../features/events/eventsService';
import type {
  CreateEventRequest,
  EventDetails,
  EventTypeCode,
  SportCode,
} from '../../../shared/types/event';

type EditEventFormValues = {
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

type EditEventModalProps = {
  open: boolean;
  event: EventDetails;
  onClose: () => void;
  onUpdated?: () => void;
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

function toPayload(values: EditEventFormValues): CreateEventRequest {
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
  return payload;
}

export function EditEventModal({ open, event, onClose, onUpdated }: EditEventModalProps) {
  const [form] = Form.useForm<EditEventFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: event.name,
      eventType: event.eventType as EventTypeCode,
      sport: event.sport as SportCode,
      eventDate: dayjs(event.eventDate),
      distanceKm: event.distanceKm,
      description: event.description ?? undefined,
      registrationOpen: event.registrationOpen ? dayjs(event.registrationOpen) : null,
      registrationClose: event.registrationClose ? dayjs(event.registrationClose) : null,
    });
  }, [event, form, open]);

  const handleCancel = () => {
    if (submitting) return;
    onClose();
  };

  const closeFeedback = () => {
    const wasSuccess = feedback?.status === 'success';
    setFeedback(null);
    if (wasSuccess) {
      onClose();
      onUpdated?.();
    }
  };

  const handleFinish = async (values: EditEventFormValues) => {
    setSubmitting(true);
    try {
      const result = await eventsService.updateEvent(event.id, toPayload(values));
      if (result.status === 200 || result.status === 201) {
        setFeedback({
          status: 'success',
          title: 'Мероприятие обновлено',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось обновить мероприятие',
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
          subtitle: 'Редактировать может только администратор, который создал это мероприятие.',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось обновить мероприятие',
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
        title="Редактировать мероприятие"
        open={open}
        onCancel={handleCancel}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={submitting}>
            Отмена
          </Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={() => form.submit()}>
            Сохранить
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item label="Трасса">
            <Input value={event.track.name} disabled />
          </Form.Item>

          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true, message: 'Укажите название' }]}
          >
            <Input />
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
            <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
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
