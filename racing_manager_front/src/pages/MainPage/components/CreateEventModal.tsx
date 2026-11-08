import { Button, DatePicker, Form, Input, Modal, Result, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { authService } from '../../../features/auth/authService';
import { eventsService } from '../../../features/events/eventsService';
import {
  EventStartsFormItems,
  buildStartsPayload,
  defaultStartValue,
  type StartFormValue,
} from '../../../features/events/EventStartsFormItems';
import { EventMapLinkFormItem } from '../../../features/events/EventMapLinkFormItem';
import { dateTimePickerProps } from '../../../shared/formatDateTime';
import type {
  CreateEventRequest,
  EventTypeCode,
  ParticipationFormat,
  SportCode,
} from '../../../shared/types/event';

type CreateEventFormValues = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: Dayjs;
  description?: string;
  mapLink?: string;
  registrationOpen?: Dayjs | null;
  registrationClose?: Dayjs | null;
  starts: StartFormValue[];
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
  const [startTabIndex, setStartTabIndex] = useState(0);
  const [formats, setFormats] = useState<ParticipationFormat[]>([]);
  const sport = Form.useWatch('sport', form);

  useEffect(() => {
    if (open) {
      setStartTabIndex(0);
      form.setFieldsValue({
        eventType: 'TIME_TRIAL',
        sport: 'SKI',
      });
    } else {
      setFormats([]);
    }
  }, [form, open]);

  useEffect(() => {
    if (!open || !sport) {
      return;
    }
    let cancelled = false;
    eventsService
      .listFormats(sport)
      .then((rows) => {
        if (cancelled) return;
        setFormats(rows);
        form.setFieldValue('starts', [defaultStartValue(rows)]);
      })
      .catch(() => {
        if (cancelled) return;
        setFormats([]);
        form.setFieldValue('starts', []);
      });
    return () => {
      cancelled = true;
    };
  }, [form, open, sport]);

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
    const starts = buildStartsPayload(values.starts ?? []);
    const primary = starts[0];
    const payload: CreateEventRequest = {
      name: values.name.trim(),
      eventType: values.eventType,
      sport: values.sport,
      eventDate: values.eventDate.toDate().toISOString(),
      starts,
      ...(primary
        ? {
            distanceKm: Number(
              ((primary.lapCount * primary.lapLengthMeters) / 1000).toFixed(2),
            ),
          }
        : {}),
    };
    if (values.description?.trim()) payload.description = values.description.trim();
    if (values.mapLink?.trim()) payload.mapLink = values.mapLink.trim();
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
        width={1040}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={submitting}>
            Отмена
          </Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={() => form.submit()} disabled={Boolean(feedback) || (Boolean(sport === 'SKI' || sport === 'ROLLER_SKI') && formats.length === 0)}>
            Создать
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ eventType: 'TIME_TRIAL', sport: 'SKI' }}
          onFinish={handleFinish}
          onFinishFailed={({ errorFields }) => {
            const firstStartError = errorFields.find(
              (field) => field.name[0] === 'starts',
            );
            if (firstStartError) {
              setStartTabIndex(Number(firstStartError.name[1]));
            }
          }}
        >
          <Form.Item name="eventType" hidden>
            <Input />
          </Form.Item>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
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
              <DatePicker {...dateTimePickerProps} />
            </Form.Item>

            <Form.Item name="registrationOpen" label="Начало выдачи номеров">
              <DatePicker {...dateTimePickerProps} />
            </Form.Item>

            <Form.Item
              name="registrationClose"
              label="Окончание выдачи номеров"
              dependencies={['registrationOpen']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value: Dayjs | null) {
                    const openAt = getFieldValue('registrationOpen') as Dayjs | null | undefined;
                    if (openAt && value && value.isBefore(openAt)) {
                      return Promise.reject(
                        new Error('Окончание выдачи номеров не может быть раньше начала'),
                      );
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <DatePicker {...dateTimePickerProps} />
            </Form.Item>

            <div style={{ gridColumn: '1 / -1' }}>
              <Form.Item name="description" label="Описание">
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 12 }} placeholder="Необязательно" />
              </Form.Item>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <EventMapLinkFormItem />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <EventStartsFormItems
                formats={formats}
                activeIndex={startTabIndex}
                onActiveIndexChange={setStartTabIndex}
              />
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        open={Boolean(feedback)}
        zIndex={1100}
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
