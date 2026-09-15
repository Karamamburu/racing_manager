import { Button, DatePicker, Form, Input, Modal, Result, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { authService } from '../../../features/auth/authService';
import { personalService } from '../../../features/personal/personalService';
import { PersonalDataConsentCheckbox } from '../../../shared/personalConsent/PersonalDataConsentCheckbox';
import type { PersonalProfile, UpdatePersonalRequest } from '../../../shared/types/personal';

type EditProfileFormValues = {
  firstName: string;
  lastName: string;
  gender?: 'M' | 'F' | null;
  birthDate?: Dayjs | null;
  city?: string;
  district?: string;
  team?: string;
  personalDataConsent?: boolean;
};

type FeedbackStatus = 'success' | 'unauthorized' | 'error';

type FeedbackState = {
  status: FeedbackStatus;
  title: string;
  subtitle?: string;
};

type EditProfileModalProps = {
  open: boolean;
  profile: PersonalProfile | null | undefined;
  username?: string | null;
  email?: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

const genderOptions = [
  { value: 'M', label: 'Мужской' },
  { value: 'F', label: 'Женский' },
];

function toPayload(values: EditProfileFormValues): UpdatePersonalRequest {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    gender: values.gender ?? null,
    birthDate: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
    city: values.city?.trim() || null,
    district: values.district?.trim() || null,
    team: values.team?.trim() || null,
    personalDataConsent: true,
  };
}

export function EditProfileModal({
  open,
  profile,
  username,
  email,
  onClose,
  onUpdated,
}: EditProfileModalProps) {
  const [form] = Form.useForm<EditProfileFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    if (!open) return;
    const gender = profile?.gender === 'M' || profile?.gender === 'F' ? profile.gender : undefined;
    form.setFieldsValue({
      firstName: profile?.firstName ?? undefined,
      lastName: profile?.lastName ?? undefined,
      gender,
      birthDate: profile?.birthDate ? dayjs(profile.birthDate) : null,
      city: profile?.city ?? undefined,
      district: profile?.district ?? undefined,
      team: profile?.team ?? undefined,
      personalDataConsent: false,
    });
  }, [form, open, profile]);

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

  const handleFinish = async (values: EditProfileFormValues) => {
    setSubmitting(true);
    try {
      const result = await personalService.updatePersonal(toPayload(values));
      if (result.status === 200) {
        setFeedback({
          status: 'success',
          title: 'Профиль обновлён',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось сохранить профиль',
        subtitle: `Неожиданный код ответа: ${result.status}`,
      });
    } catch (error) {
      const status = personalService.getStatus(error);
      if (status === 401) {
        setFeedback({
          status: 'unauthorized',
          title: 'Неаутентифицирован',
          subtitle: 'Сессия недействительна или истекла. Войдите в систему ещё раз.',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: 'Не удалось сохранить профиль',
        subtitle: personalService.getErrorMessage(error),
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
        : 'error';

  return (
    <>
      <Modal
        title="Редактировать профиль"
        open={open}
        onCancel={handleCancel}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={handleCancel} disabled={submitting}>
            Отмена
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            disabled={Boolean(feedback)}
            onClick={() => form.submit()}
          >
            Сохранить
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item label="Username">
            <Input value={username ?? ''} disabled />
          </Form.Item>
          <Form.Item label="Email">
            <Input value={email ?? ''} disabled />
          </Form.Item>

          <Form.Item
            name="firstName"
            label="Имя"
            rules={[{ required: true, message: 'Укажите имя' }, { max: 80, message: 'Не больше 80 символов' }]}
          >
            <Input maxLength={80} />
          </Form.Item>

          <Form.Item
            name="lastName"
            label="Фамилия"
            rules={[{ required: true, message: 'Укажите фамилию' }, { max: 80, message: 'Не больше 80 символов' }]}
          >
            <Input maxLength={80} />
          </Form.Item>

          <Form.Item name="gender" label="Пол">
            <Select allowClear options={genderOptions} />
          </Form.Item>

          <Form.Item name="birthDate" label="Дата рождения">
            <DatePicker
              style={{ width: '100%' }}
              format="DD.MM.YYYY"
              disabledDate={(current) => Boolean(current && current.isAfter(dayjs(), 'day'))}
            />
          </Form.Item>

          <Form.Item name="city" label="Город" rules={[{ max: 120, message: 'Не больше 120 символов' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="district" label="Район" rules={[{ max: 120, message: 'Не больше 120 символов' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="team" label="Команда" rules={[{ max: 120, message: 'Не больше 120 символов' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <PersonalDataConsentCheckbox />
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
