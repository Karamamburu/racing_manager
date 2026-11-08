import { Button, DatePicker, Form, Input, Modal, Result, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
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
  EventDetails,
  EventTypeCode,
  ParticipationFormat,
  SportCode,
} from '../../../shared/types/event';

type EditEventFormValues = {
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

function toStartFormValues(event: EventDetails): StartFormValue[] {
  if (event.starts?.length) {
    return event.starts.map((start) => ({
      id: start.id,
      purposeType: start.purposeType,
      formatIds: start.formatIds,
      lapCount: start.lapCount,
      lapLengthKm: start.lapLengthMeters / 1000,
      displayName: start.displayName ?? null,
      legacyEffectiveDistanceM: start.legacyEffectiveDistanceM,
    }));
  }
  const lapCount = event.laps.length || 1;
  const lapLengthKm =
    event.laps[0]?.distanceKm ??
    (event.distanceKm ? Number((event.distanceKm / lapCount).toFixed(2)) : 1);
  return [
    {
      purposeType: 'CUP_RACE',
      formatIds: event.formats.map((format) => format.id),
      lapCount,
      lapLengthKm,
      displayName: null,
    },
  ];
}

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
  return payload;
}

export function EditEventModal({ open, event, onClose, onUpdated }: EditEventModalProps) {
  const [form] = Form.useForm<EditEventFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [formats, setFormats] = useState<ParticipationFormat[]>([]);
  const sport = Form.useWatch('sport', form);

  useEffect(() => {
    if (!open) {
      setFormats([]);
      return;
    }
    form.setFieldsValue({
      name: event.name,
      eventType: event.eventType as EventTypeCode,
      sport: event.sport as SportCode,
      eventDate: dayjs(event.eventDate),
      description: event.description ?? undefined,
      mapLink: event.mapLink ?? undefined,
      registrationOpen: event.registrationOpen ? dayjs(event.registrationOpen) : null,
      registrationClose: event.registrationClose ? dayjs(event.registrationClose) : null,
    });
  }, [event, form, open]);

  useEffect(() => {
    if (!open || !sport) return;
    let cancelled = false;
    eventsService
      .listFormats(sport)
      .then((rows) => {
        if (cancelled) return;
        setFormats(rows);
        if (sport === event.sport) {
          form.setFieldValue('starts', toStartFormValues(event));
        } else {
          const current =
            (form.getFieldValue('starts') as StartFormValue[] | undefined) ??
            [];
          const base =
            current.length > 0 ? current : [defaultStartValue(rows)];
          form.setFieldValue(
            'starts',
            base.map((start) => ({
              ...start,
              formatIds: rows.map((row) => row.id),
            })),
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFormats([]);
        form.setFieldValue('starts', []);
      });
    return () => {
      cancelled = true;
    };
  }, [event, form, open, sport]);

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
          <Button key="submit" type="primary" loading={submitting} onClick={() => form.submit()} disabled={Boolean(feedback) || (Boolean(sport === 'SKI' || sport === 'ROLLER_SKI') && formats.length === 0)}>
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
            <DatePicker {...dateTimePickerProps} />
          </Form.Item>

          <EventStartsFormItems formats={formats} />

          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>

          <EventMapLinkFormItem />

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
