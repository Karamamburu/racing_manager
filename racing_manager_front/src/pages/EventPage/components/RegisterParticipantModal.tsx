import { Input, InputNumber, Modal, Radio, Select, Space, Spin, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  registrationsService,
  type ParticipantSearchHit,
} from '../../../features/registrations/registrationsService';
import type { EventFormatRef } from '../../../shared/types/event';

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
  }, [formats, open]);

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

  return (
    <Modal
      title="Зарегистрировать участника"
      open={open}
      onCancel={onClose}
      okText="Зарегистрировать"
      cancelText="Отмена"
      confirmLoading={saving}
      okButtonProps={{ disabled: !canSubmit }}
      onOk={() => void submit()}
      destroyOnClose
    >
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
          <Typography.Text type="secondary">Никого не нашли</Typography.Text>
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
      </Space>
    </Modal>
  );
}
