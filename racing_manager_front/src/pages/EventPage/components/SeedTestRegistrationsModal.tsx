import { Form, InputNumber, Modal, Select, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { registrationsService } from '../../../features/registrations/registrationsService';
import type { EventFormatRef, GenderCode } from '../../../shared/types/event';

type SeedTestRegistrationsModalProps = {
  open: boolean;
  eventId: string;
  formats: EventFormatRef[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

type FormValues = {
  count: number;
  gender: GenderCode;
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
  onClose,
  onCreated,
}: SeedTestRegistrationsModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      count: 12,
      gender: 'M',
      formatId: formats.length === 1 ? formats[0].id : undefined,
    });
  }, [form, formats, open]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await registrationsService.seedTestBatch(eventId, {
        count: values.count,
        gender: values.gender,
        ...(values.formatId != null ? { formatId: values.formatId } : {}),
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
        {formats.length > 0 ? (
          <Form.Item
            name="formatId"
            label="Дисциплина"
            rules={[{ required: true, message: 'Выберите дисциплину' }]}
          >
            <Select
              options={formats.map((format) => ({ value: format.id, label: format.name }))}
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
