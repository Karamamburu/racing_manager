import { Button, Form, Input, InputNumber, Modal, Result, Select } from 'antd';
import { useEffect, useState } from 'react';
import { registrationsService } from '../../../features/registrations/registrationsService';
import type { CreateRegistrationRequest, GenderCode } from '../../../shared/types/event';
import type { PersonalResponse } from '../../../shared/types/personal';

type RegisterFormValues = {
  firstName: string;
  lastName: string;
  gender: GenderCode;
  birthYear: number;
  city?: string;
  district?: string;
  team?: string;
};

type FeedbackStatus = 'success' | 'conflict' | 'error';

type FeedbackState = {
  status: FeedbackStatus;
  title: string;
  subtitle?: string;
};

type RegisterEventModalProps = {
  open: boolean;
  eventId: string;
  profile: PersonalResponse['profile'] | null | undefined;
  onClose: () => void;
  onRegistered?: () => void;
};

const genderOptions = [
  { value: 'M', label: 'Мужской' },
  { value: 'F', label: 'Женский' },
];

const currentYear = new Date().getFullYear();

function birthYearFromProfile(birthDate: string | null | undefined): number | undefined {
  if (!birthDate) return undefined;
  const year = Number(birthDate.slice(0, 4));
  return Number.isInteger(year) ? year : undefined;
}

function toPayload(values: RegisterFormValues): CreateRegistrationRequest {
  const payload: CreateRegistrationRequest = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    gender: values.gender,
    birthYear: values.birthYear,
  };
  if (values.city?.trim()) payload.city = values.city.trim();
  if (values.district?.trim()) payload.district = values.district.trim();
  if (values.team?.trim()) payload.team = values.team.trim();
  return payload;
}

export function RegisterEventModal({
  open,
  eventId,
  profile,
  onClose,
  onRegistered,
}: RegisterEventModalProps) {
  const [form] = Form.useForm<RegisterFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    if (!open) return;
    const gender = profile?.gender === 'M' || profile?.gender === 'F' ? profile.gender : undefined;
    form.setFieldsValue({
      firstName: profile?.firstName ?? undefined,
      lastName: profile?.lastName ?? undefined,
      gender,
      birthYear: birthYearFromProfile(profile?.birthDate),
      city: profile?.city ?? undefined,
      district: profile?.district ?? undefined,
      team: profile?.team ?? undefined,
    });
  }, [form, open, profile]);

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
      onRegistered?.();
    }
  };

  const handleFinish = async (values: RegisterFormValues) => {
    setSubmitting(true);
    try {
      const result = await registrationsService.create(eventId, toPayload(values));
      if (result.status === 201 || result.status === 200) {
        setFeedback({
          status: 'success',
          title: 'Вы зарегистрированы',
          subtitle: 'Заявка добавлена в список участников.',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось зарегистрироваться',
        subtitle: `Неожиданный код ответа: ${result.status}`,
      });
    } catch (error) {
      const status = registrationsService.getStatus(error);
      if (status === 409) {
        setFeedback({
          status: 'conflict',
          title: 'Вы уже зарегистрированы',
          subtitle: 'На это мероприятие уже есть активная заявка.',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось зарегистрироваться',
        subtitle: registrationsService.getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resultStatus =
    feedback?.status === 'success' ? 'success' : feedback?.status === 'conflict' ? 'warning' : 'error';

  return (
    <>
      <Modal
        title="Регистрация на гонку"
        open={open}
        onCancel={handleCancel}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={submitting}>
            Отмена
          </Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={() => form.submit()}>
            Зарегистрироваться
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item
            name="firstName"
            label="Имя"
            rules={[{ required: true, message: 'Укажите имя' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="lastName"
            label="Фамилия"
            rules={[{ required: true, message: 'Укажите фамилию' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="gender"
            label="Пол"
            rules={[{ required: true, message: 'Выберите пол' }]}
          >
            <Select options={genderOptions} />
          </Form.Item>

          <Form.Item
            name="birthYear"
            label="Год рождения"
            rules={[{ required: true, message: 'Укажите год рождения' }]}
          >
            <InputNumber min={1900} max={currentYear} precision={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="city" label="Город">
            <Input />
          </Form.Item>

          <Form.Item name="district" label="Район">
            <Input />
          </Form.Item>

          <Form.Item name="team" label="Команда">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(feedback)}
        onCancel={closeFeedback}
        footer={[
          <Button key="ok" type="primary" onClick={closeFeedback}>
            Хорошо
          </Button>,
        ]}
      >
        {feedback ? (
          <Result status={resultStatus} title={feedback.title} subTitle={feedback.subtitle} />
        ) : null}
      </Modal>
    </>
  );
}
