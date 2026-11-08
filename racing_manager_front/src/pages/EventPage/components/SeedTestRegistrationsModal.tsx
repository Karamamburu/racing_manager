import { Form, InputNumber, Modal, Select, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { registrationsService } from '../../../features/registrations/registrationsService';
import type {
  EventFormatRef,
  GenderCode,
  StartResponse,
} from '../../../shared/types/event';

type SeedTestRegistrationsModalProps = {
  open: boolean;
  eventId: string;
  formats: EventFormatRef[];
  starts?: StartResponse[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

type FormValues = {
  count: number;
  gender: GenderCode;
  startId?: string;
  formatId?: number;
};

const genderOptions = [
  { value: 'M', label: 'Мужской' },
  { value: 'F', label: 'Женский' },
];

export function SeedTestRegistrationsModal({
  open,
  eventId,
  formats,
  starts = [],
  onClose,
  onCreated,
}: SeedTestRegistrationsModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const startId = Form.useWatch('startId', form);
  const selectedStart = starts.find((start) => start.id === startId);
  const formatOptions = formats.filter((format) =>
    selectedStart ? selectedStart.formatIds.includes(format.id) : true,
  );

  useEffect(() => {
    if (!open) return;
    const firstStart = starts[0];
    const firstFormatId = firstStart
      ? formats.find((format) => firstStart.formatIds.includes(format.id))?.id
      : formats.length === 1
        ? formats[0].id
        : undefined;
    form.setFieldsValue({
      count: 12,
      gender: 'M',
      startId: firstStart?.id,
      formatId: firstFormatId,
    });
  }, [form, formats, open, starts]);

  useEffect(() => {
    if (!selectedStart) return;
    const current = form.getFieldValue('formatId') as number | undefined;
    if (current != null && selectedStart.formatIds.includes(current)) return;
    const next = formats.find((format) =>
      selectedStart.formatIds.includes(format.id),
    );
    form.setFieldValue('formatId', next?.id);
  }, [form, formats, selectedStart]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (values.startId == null || values.formatId == null) {
        message.error('Выберите старт и дисциплину.');
        return;
      }
      const result = await registrationsService.seedTestBatch(eventId, {
        count: values.count,
        gender: values.gender,
        startId: values.startId,
        formatId: values.formatId,
      });
      message.success(`Создано тестовых заявок: ${result.data.created}`);
      await onCreated();
      onClose();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 403) {
        message.error('Тестовые заявки может создавать только администратор.');
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Тестовые заявки"
      open={open}
      onCancel={onClose}
      okText="Создать"
      cancelText="Отмена"
      confirmLoading={saving}
      onOk={submit}
      destroyOnClose
    >
      <Typography.Paragraph type="secondary">
        Случайные участники без аккаунта. Заявки сразу получают стартовые номера.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="count"
          label="Количество"
          rules={[{ required: true, type: 'number', min: 1, max: 100, message: 'От 1 до 100' }]}
        >
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
        {starts.length > 0 ? (
          <Form.Item
            name="startId"
            label="Старт"
            rules={[{ required: true, message: 'Выберите старт' }]}
          >
            <Select
              options={starts.map((start) => ({
                value: start.id,
                label: start.resolvedLabel,
              }))}
              placeholder="Выберите старт"
            />
          </Form.Item>
        ) : null}
        {formatOptions.length > 0 ? (
          <Form.Item
            name="formatId"
            label="Дисциплина"
            rules={[{ required: true, message: 'Выберите дисциплину' }]}
          >
            <Select
              options={formatOptions.map((format) => ({
                value: format.id,
                label: format.name,
              }))}
              placeholder="Формат участия"
            />
          </Form.Item>
        ) : null}
        <Form.Item
          name="gender"
          label="Пол"
          rules={[{ required: true, message: 'Выберите пол' }]}
        >
          <Select options={genderOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
