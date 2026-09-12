import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Result, Select, Skeleton, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { personalQueryKey, usePersonalQuery } from '../../../features/auth/usePersonalQuery';
import { useSessionQuery } from '../../../features/auth/useSessionQuery';
import { personalService } from '../../../features/personal/personalService';
import { registrationsService } from '../../../features/registrations/registrationsService';
import type { CreateRegistrationRequest, EventFormatRef, GenderCode } from '../../../shared/types/event';
import type { PersonalProfile, PersonalResponse, UpdatePersonalRequest } from '../../../shared/types/personal';

type RegisterFormValues = {
  firstName: string;
  lastName: string;
  gender: GenderCode;
  birthYear: number;
  city?: string;
  district?: string;
  team?: string;
  formatId?: number;
};

type FieldLocks = Record<keyof RegisterFormValues, boolean>;

type FeedbackStatus = 'success' | 'conflict' | 'error';

type FeedbackState = {
  status: FeedbackStatus;
  title: string;
  subtitle?: string;
};

type RegisterEventModalProps = {
  open: boolean;
  eventId: string;
  formats: EventFormatRef[];
  onClose: () => void;
  onRegistered?: () => void;
};

const genderOptions = [
  { value: 'M', label: 'Мужской' },
  { value: 'F', label: 'Женский' },
];

const genderLabels: Record<GenderCode, string> = {
  M: 'Мужской',
  F: 'Женский',
};

const currentYear = new Date().getFullYear();

function birthYearFromProfile(birthDate: string | null | undefined): number | undefined {
  if (!birthDate) return undefined;
  const year = Number(birthDate.slice(0, 4));
  return Number.isInteger(year) ? year : undefined;
}

function fieldLocks(
  isAuthenticated: boolean,
  profile: PersonalResponse['profile'] | null | undefined,
): FieldLocks {
  if (!isAuthenticated) {
    return {
      firstName: false,
      lastName: false,
      gender: false,
      birthYear: false,
      city: false,
      district: false,
      team: false,
      formatId: false,
    };
  }
  return {
    firstName: Boolean(profile?.firstName?.trim()),
    lastName: Boolean(profile?.lastName?.trim()),
    gender: profile?.gender === 'M' || profile?.gender === 'F',
    birthYear: birthYearFromProfile(profile?.birthDate) != null,
    city: Boolean(profile?.city?.trim()),
    district: Boolean(profile?.district?.trim()),
    team: Boolean(profile?.team?.trim()),
    formatId: false,
  };
}

function toPayload(values: RegisterFormValues, locks: FieldLocks): CreateRegistrationRequest {
  const payload: CreateRegistrationRequest = {};
  if (!locks.firstName && values.firstName?.trim()) payload.firstName = values.firstName.trim();
  if (!locks.lastName && values.lastName?.trim()) payload.lastName = values.lastName.trim();
  if (!locks.gender && values.gender) payload.gender = values.gender;
  if (!locks.birthYear && values.birthYear != null) payload.birthYear = values.birthYear;
  if (!locks.city && values.city?.trim()) payload.city = values.city.trim();
  if (!locks.district && values.district?.trim()) payload.district = values.district.trim();
  if (!locks.team && values.team?.trim()) payload.team = values.team.trim();
  if (values.formatId != null) payload.formatId = values.formatId;
  return payload;
}

function hasSupplements(payload: CreateRegistrationRequest): boolean {
  const { formatId: _formatId, ...personal } = payload;
  return Object.values(personal).some((value) => value !== undefined && value !== '');
}

function toProfileUpdate(
  profile: PersonalProfile | null | undefined,
  extra: CreateRegistrationRequest,
  birthDate: string | null,
): UpdatePersonalRequest | null {
  const firstName = extra.firstName?.trim() || profile?.firstName?.trim();
  const lastName = extra.lastName?.trim() || profile?.lastName?.trim();
  if (!firstName || !lastName) return null;

  const gender =
    extra.gender ??
    (profile?.gender === 'M' || profile?.gender === 'F' ? profile.gender : null);

  return {
    firstName,
    lastName,
    gender,
    birthDate: birthDate ?? profile?.birthDate ?? null,
    city: extra.city?.trim() || profile?.city || null,
    district: extra.district?.trim() || profile?.district || null,
    team: extra.team?.trim() || profile?.team || null,
  };
}

export function RegisterEventModal({
  open,
  eventId,
  formats,
  onClose,
  onRegistered,
}: RegisterEventModalProps) {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const isAuthenticated = Boolean(sessionQuery.data?.authenticated);
  const personalQuery = usePersonalQuery({ enabled: open && isAuthenticated });
  const profile = personalQuery.data?.profile;
  const waitingProfile = open && isAuthenticated && !personalQuery.isFetched;
  const [form] = Form.useForm<RegisterFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [didRegister, setDidRegister] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [supplements, setSupplements] = useState<CreateRegistrationRequest | null>(null);
  const [profileBirthDate, setProfileBirthDate] = useState<Dayjs | null>(null);
  const locks = fieldLocks(isAuthenticated && personalQuery.isSuccess, profile);
  const profileComplete = locks.firstName && locks.lastName && locks.gender && locks.birthYear;

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
      formatId: formats.length === 1 ? formats[0].id : undefined,
    });
  }, [form, formats, open, profile]);

  const resetLocalState = () => {
    form.resetFields();
    setDidRegister(false);
    setSupplements(null);
    setProfileBirthDate(null);
  };

  const handleCancel = () => {
    if (submitting || savingProfile) return;
    resetLocalState();
    onClose();
  };

  const finishSuccess = () => {
    setFeedback(null);
    resetLocalState();
    onClose();
    onRegistered?.();
  };

  const closeFeedback = () => {
    if (savingProfile) return;
    if (didRegister || feedback?.status === 'success') {
      finishSuccess();
      return;
    }
    setFeedback(null);
  };

  const handleFinish = async (values: RegisterFormValues) => {
    setSubmitting(true);
    try {
      const payload = toPayload(values, locks);
      const result = await registrationsService.create(eventId, payload);
      if (result.status === 201 || result.status === 200) {
        const extra = isAuthenticated && hasSupplements(payload) ? payload : null;
        setDidRegister(true);
        setSupplements(extra);
        setProfileBirthDate(null);
        setFeedback({
          status: 'success',
          title: 'Вы зарегистрированы',
          subtitle: extra
            ? 'Заявка добавлена в список участников. Можно сохранить новые данные в профиле, чтобы не вводить их снова.'
            : 'Заявка добавлена в список участников.',
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
          title: 'Участник уже зарегистрирован',
          subtitle: registrationsService.getErrorMessage(error),
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

  const saveSupplementsToProfile = async () => {
    if (!supplements) return;
    const birthDate = profileBirthDate ? profileBirthDate.format('YYYY-MM-DD') : null;
    const payload = toProfileUpdate(profile, supplements, birthDate);
    if (!payload) {
      finishSuccess();
      return;
    }
    setSavingProfile(true);
    try {
      await personalService.updatePersonal(payload);
      await queryClient.invalidateQueries({ queryKey: personalQueryKey });
      finishSuccess();
    } catch (error) {
      setFeedback({
        status: 'error',
        title: 'Заявка создана, но профиль не обновлён',
        subtitle: personalService.getErrorMessage(error),
      });
      setSupplements(null);
    } finally {
      setSavingProfile(false);
    }
  };

  const resultStatus =
    feedback?.status === 'success' ? 'success' : feedback?.status === 'conflict' ? 'warning' : 'error';
  const showProfileOffer = feedback?.status === 'success' && Boolean(supplements);

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
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            disabled={Boolean(feedback) || waitingProfile}
            onClick={() => form.submit()}
          >
            Зарегистрироваться
          </Button>,
        ]}
      >
        {waitingProfile ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <>
            {isAuthenticated ? (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  profileComplete
                    ? 'Данные заявки берутся из вашего профиля'
                    : 'Недостающие поля можно указать только для этой заявки'
                }
                description={
                  profileComplete ? (
                    <>
                      Поля из профиля нельзя изменить здесь. Отредактировать их можно в{' '}
                      <Link to="/cabinet">личном кабинете</Link>.
                    </>
                  ) : (
                    <>
                      Заполненные поля профиля заблокированы. Пустые можно ввести в форме — они попадут
                      в заявку. После регистрации предложим сохранить их в{' '}
                      <Link to="/cabinet">профиле</Link>.
                    </>
                  )
                }
              />
            ) : null}
            <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item
            name="firstName"
            label="Имя"
            rules={[{ required: !locks.firstName, message: 'Укажите имя' }]}
          >
            <Input disabled={locks.firstName} />
          </Form.Item>

          <Form.Item
            name="lastName"
            label="Фамилия"
            rules={[{ required: !locks.lastName, message: 'Укажите фамилию' }]}
          >
            <Input disabled={locks.lastName} />
          </Form.Item>

          <Form.Item
            name="gender"
            label="Пол"
            rules={[{ required: !locks.gender, message: 'Выберите пол' }]}
          >
            <Select options={genderOptions} disabled={locks.gender} />
          </Form.Item>

          {formats.length > 0 ? (
            <Form.Item
              name="formatId"
              label="Формат участия"
              rules={[{ required: true, message: 'Выберите формат участия' }]}
            >
              <Select
                disabled={formats.length === 1}
                options={formats.map((format) => ({
                  label: format.name,
                  value: format.id,
                }))}
              />
            </Form.Item>
          ) : null}

          <Form.Item
            name="birthYear"
            label="Год рождения"
            rules={[{ required: !locks.birthYear, message: 'Укажите год рождения' }]}
          >
            <InputNumber
              min={1900}
              max={currentYear}
              precision={0}
              style={{ width: '100%' }}
              disabled={locks.birthYear}
            />
          </Form.Item>

          <Form.Item name="city" label="Город">
            <Input disabled={locks.city} />
          </Form.Item>

          <Form.Item name="district" label="Район">
            <Input disabled={locks.district} />
          </Form.Item>

            <Form.Item name="team" label="Команда">
              <Input disabled={locks.team} />
            </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(feedback)}
        zIndex={1100}
        destroyOnClose
        onCancel={closeFeedback}
        footer={
          showProfileOffer
            ? [
                <Button key="skip" onClick={finishSuccess} disabled={savingProfile}>
                  Не сейчас
                </Button>,
                <Button
                  key="save"
                  type="primary"
                  loading={savingProfile}
                  onClick={() => void saveSupplementsToProfile()}
                >
                  Сохранить в профиль
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
          <Result
            status={resultStatus}
            title={feedback.title}
            subTitle={
              showProfileOffer && supplements ? (
                <div style={{ textAlign: 'left' }}>
                  <Typography.Paragraph>{feedback.subtitle}</Typography.Paragraph>
                  <Typography.Paragraph strong>Новые данные в заявке:</Typography.Paragraph>
                  <ul>
                    {supplements.firstName ? <li>Имя: {supplements.firstName}</li> : null}
                    {supplements.lastName ? <li>Фамилия: {supplements.lastName}</li> : null}
                    {supplements.gender ? <li>Пол: {genderLabels[supplements.gender]}</li> : null}
                    {supplements.birthYear != null ? (
                      <li>Год рождения: {supplements.birthYear}</li>
                    ) : null}
                    {supplements.city ? <li>Город: {supplements.city}</li> : null}
                    {supplements.district ? <li>Район: {supplements.district}</li> : null}
                    {supplements.team ? <li>Команда: {supplements.team}</li> : null}
                  </ul>
                  {supplements.birthYear != null ? (
                    <>
                      <Typography.Paragraph>
                        В профиле хранится полная дата. Можно указать её сейчас или оставить пустой.
                      </Typography.Paragraph>
                      <DatePicker
                        style={{ width: '100%' }}
                        format="DD.MM.YYYY"
                        value={profileBirthDate}
                        onChange={(value) => setProfileBirthDate(value)}
                        defaultPickerValue={dayjs(`${supplements.birthYear}-01-01`)}
                        disabledDate={(current) => {
                          if (!current) return false;
                          if (current.isAfter(dayjs(), 'day')) return true;
                          return current.year() !== supplements.birthYear;
                        }}
                      />
                    </>
                  ) : null}
                </div>
              ) : (
                feedback.subtitle
              )
            }
          />
        ) : null}
      </Modal>
    </>
  );
}
