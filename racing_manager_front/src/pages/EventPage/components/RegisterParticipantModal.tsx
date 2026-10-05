import { Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Spin, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  registrationsService,
  type ParticipantSearchHit,
} from '../../../features/registrations/registrationsService';
import type { EventFormatRef, GenderCode } from '../../../shared/types/event';

type ManualFormValues = {
  firstName: string;
  lastName: string;
  gender: GenderCode;
  birthYear: number;
  city?: string;
  district?: string;
  team?: string;
  formatId?: number;
  startNumber?: number | null;
};

const genderOptions = [
  { value: 'M', label: 'Мужской' },
  { value: 'F', label: 'Женский' },
];

const currentYear = new Date().getFullYear();

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

type RegisterParticipantModalProps = {
  open: boolean;
  eventId: string;
  formats: EventFormatRef[];
  onClose: () => void;
  onRegistered: () => Promise<void> | void;
};

function displayName(user: ParticipantSearchHit): string {
  const name = [user.lastName, user.firstName].filter(Boolean).join(' ');
  return name || user.userName;
}

export function RegisterParticipantModal({
  open,
  eventId,
  formats,
  onClose,
  onRegistered,
}: RegisterParticipantModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ParticipantSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formatId, setFormatId] = useState<number | undefined>(undefined);
  const [startNumber, setStartNumber] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState(false);
  const [form] = Form.useForm<ManualFormValues>();

  useEffect(() => {
    if (open) {
      setFormatId(formats.length === 1 ? formats[0].id : undefined);
      return;
    }
    setQuery('');
    setResults([]);
    setSearchError(null);
    setSearching(false);
    setSelectedId(null);
    setFormatId(undefined);
    setStartNumber(null);
    setManual(false);
    form.resetFields();
  }, [formats, form, open]);

  useEffect(() => {
    if (!open || !manual || formats.length !== 1) return;
    form.setFieldValue('formatId', formats[0].id);
  }, [formats, form, manual, open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void registrationsService
        .searchUsers(eventId, trimmed)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setResults([]);
          setSearchError(registrationsService.getErrorMessage(error));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventId, open, query]);

  const selected = results.find((user) => user.id === selectedId) ?? null;
  const canSubmit =
    selected != null &&
    selected.profileReady &&
    !selected.alreadyRegistered &&
    (formats.length === 0 || formatId != null);

  const submit = async () => {
    if (!selected || !canSubmit) return;
    setSaving(true);
    try {
      await registrationsService.createForUser(eventId, {
        userId: selected.id,
        ...(formatId != null ? { formatId } : {}),
        ...(startNumber != null ? { startNumber } : {}),
      });
      message.success(
        startNumber != null
          ? `${displayName(selected)} зарегистрирован, номер ${startNumber} выдан`
          : `${displayName(selected)} зарегистрирован`,
      );
      await onRegistered();
      onClose();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 409) {
        const text = registrationsService.getErrorMessage(error);
        message.error(
          text === 'Already registered for this event.'
            ? 'Участник уже зарегистрирован на это мероприятие.'
            : text,
        );
      } else if (statusCode === 403) {
        message.error('Недостаточно прав. Заявку может создать организатор или администратор.');
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const submitManual = async (values: ManualFormValues) => {
    setSaving(true);
    try {
      const assignedNumber =
        typeof values.startNumber === 'number' ? values.startNumber : undefined;
      await registrationsService.createGuest(eventId, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        gender: values.gender,
        birthYear: values.birthYear,
        city: blankToUndefined(values.city),
        district: blankToUndefined(values.district),
        team: blankToUndefined(values.team),
        ...(values.formatId != null ? { formatId: values.formatId } : {}),
        ...(assignedNumber != null ? { startNumber: assignedNumber } : {}),
      });
      const name = `${values.lastName.trim()} ${values.firstName.trim()}`;
      message.success(
        assignedNumber != null
          ? `${name} зарегистрирован, номер ${assignedNumber} выдан`
          : `${name} зарегистрирован`,
      );
      await onRegistered();
      onClose();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 403) {
        message.error('Недостаточно прав. Заявку может создать организатор или администратор.');
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Зарегистрировать участника"
      open={open}
      onCancel={onClose}
      okText="Зарегистрировать"
      cancelText="Отмена"
      confirmLoading={saving}
      okButtonProps={{ disabled: manual ? false : !canSubmit }}
      onOk={() => {
        if (manual) {
          form.submit();
          return;
        }
        void submit();
      }}
      destroyOnClose
    >
      {manual ? (
        <Form form={form} layout="vertical" onFinish={(values) => void submitManual(values)}>
          <Button
            type="link"
            style={{ paddingInline: 0, marginBottom: 8 }}
            onClick={() => setManual(false)}
          >
            К поиску пользователя
          </Button>
          <Typography.Paragraph type="secondary">
            Участник без учётной записи. В заявку попадут только указанные данные.
          </Typography.Paragraph>
          <Form.Item
            name="firstName"
            label="Имя"
            rules={[{ required: true, whitespace: true, message: 'Укажите имя' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="lastName"
            label="Фамилия"
            rules={[{ required: true, whitespace: true, message: 'Укажите фамилию' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="gender"
            label="Пол"
            rules={[{ required: true, message: 'Выберите пол' }]}
          >
            <Select options={genderOptions} placeholder="Выберите пол" />
          </Form.Item>
          {formats.length > 0 ? (
            <Form.Item
              name="formatId"
              label="Формат участия"
              rules={[{ required: true, message: 'Выберите формат участия' }]}
            >
              <Select
                disabled={formats.length === 1}
                placeholder="Выберите формат участия"
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
          <Form.Item name="startNumber" label="Стартовый номер">
            <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="Необязательно" />
          </Form.Item>
        </Form>
      ) : (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Text>Участник</Typography.Text>
          <Input
            allowClear
            style={{ marginTop: 8 }}
            placeholder="Email, имя пользователя, фамилия или имя"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
          />
        </div>

        {query.trim().length < 2 ? (
          <Typography.Text type="secondary">Введите хотя бы 2 символа</Typography.Text>
        ) : searching ? (
          <Spin size="small" />
        ) : searchError ? (
          <Typography.Text type="danger">{searchError}</Typography.Text>
        ) : results.length === 0 ? (
          <Typography.Text type="secondary">
            Никого не нашли. Можно добавить участника вручную.
          </Typography.Text>
        ) : (
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <Radio.Group
              value={selectedId ?? undefined}
              onChange={(event) => setSelectedId(event.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {results.map((user) => {
                  const unavailable = !user.profileReady || user.alreadyRegistered;
                  const hint = user.alreadyRegistered
                    ? 'Уже зарегистрирован на эту гонку'
                    : !user.profileReady
                      ? 'В профиле не хватает имени, фамилии, пола или даты рождения'
                      : [user.userName, user.email].filter(Boolean).join(' · ');
                  return (
                    <Radio key={user.id} value={user.id} disabled={unavailable}>
                      <span>{displayName(user)}</span>
                      <Typography.Text type="secondary" style={{ display: 'block' }}>
                        {hint}
                      </Typography.Text>
                    </Radio>
                  );
                })}
              </Space>
            </Radio.Group>
          </div>
        )}

        {selected && formats.length > 0 ? (
          <div>
            <Typography.Text>Формат участия</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Выберите формат участия"
              disabled={formats.length === 1}
              value={formatId}
              options={formats.map((format) => ({
                value: format.id,
                label: format.name,
              }))}
              onChange={setFormatId}
            />
          </div>
        ) : null}
        {selected ? (
          <div>
            <Typography.Text>Стартовый номер</Typography.Text>
            <InputNumber
              min={1}
              precision={0}
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Необязательно"
              value={startNumber}
              onChange={(value) => setStartNumber(typeof value === 'number' ? value : null)}
            />
          </div>
        ) : null}
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => setManual(true)}>
          Участника нет в системе — добавить вручную
        </Button>
      </Space>
      )}
    </Modal>
  );
}
