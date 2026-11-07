import { Button, Card, Checkbox, Form, Input, InputNumber, Select, Space } from 'antd';
import type {
  ParticipationFormat,
  StartInputRequest,
  StartPurposeType,
} from '../../shared/types/event';

export type StartFormValue = {
  id?: string;
  purposeType: StartPurposeType;
  formatIds: number[];
  lapCount: number;
  lapLengthKm: number;
  displayName?: string | null;
};

const purposeOptions = [
  { value: 'CUP_RACE', label: 'Кубковая гонка' },
  { value: 'CONTROL_TRAINING', label: 'Контрольная тренировка' },
];

export function defaultStartValue(
  formats: ParticipationFormat[],
): StartFormValue {
  return {
    purposeType: 'CUP_RACE',
    formatIds: formats.map((format) => format.id),
    lapCount: 1,
    lapLengthKm: 1,
    displayName: null,
  };
}

export function buildStartsPayload(
  starts: StartFormValue[],
): StartInputRequest[] {
  return starts.map((start, index) => ({
    ...(start.id ? { id: start.id } : {}),
    purposeType: start.purposeType ?? 'CUP_RACE',
    formatIds: [...(start.formatIds ?? [])],
    lapCount: Math.trunc(Number(start.lapCount)),
    lapLengthMeters: Math.round(Number(start.lapLengthKm) * 1000),
    displayName: start.displayName?.trim() ? start.displayName.trim() : null,
    sortOrder: index,
  }));
}

export function EventStartsFormItems({
  formats,
}: {
  formats: ParticipationFormat[];
}) {
  return (
    <Form.List name="starts">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field, index) => (
            <Card
              key={field.key}
              size="small"
              style={{ marginBottom: 12 }}
              title={`Старт ${index + 1}`}
              extra={
                fields.length > 1 ? (
                  <Button
                    type="link"
                    danger
                    onClick={() => remove(field.name)}
                  >
                    Удалить
                  </Button>
                ) : null
              }
            >
              <Form.Item name={[field.name, 'id']} hidden>
                <Input />
              </Form.Item>

              <Form.Item
                name={[field.name, 'purposeType']}
                label="Назначение"
                rules={[{ required: true, message: 'Выберите назначение' }]}
              >
                <Select options={purposeOptions} />
              </Form.Item>

              <Form.Item
                name={[field.name, 'formatIds']}
                label="Форматы участия"
                rules={[
                  { type: 'array', min: 1, message: 'Выберите хотя бы один формат' },
                ]}
              >
                <Checkbox.Group
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  options={formats.map((format) => ({
                    label: format.name,
                    value: format.id,
                  }))}
                />
              </Form.Item>

              <Space size="middle" align="start">
                <Form.Item
                  name={[field.name, 'lapCount']}
                  label="Кругов"
                  rules={[{ required: true, message: 'Укажите число кругов' }]}
                >
                  <InputNumber min={1} precision={0} />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'lapLengthKm']}
                  label="Длина круга, км"
                  rules={[{ required: true, message: 'Укажите длину круга' }]}
                >
                  <InputNumber min={0.001} step={0.1} precision={3} />
                </Form.Item>
              </Space>

              <Form.Item
                name={[field.name, 'displayName']}
                label="Название (необязательно)"
                extra="Если не заполнить, название построится автоматически по назначению и дистанции."
              >
                <Input placeholder="Например, Элита" />
              </Form.Item>
            </Card>
          ))}

          <Button
            type="dashed"
            block
            onClick={() => add(defaultStartValue(formats))}
          >
            + Добавить старт
          </Button>
        </>
      )}
    </Form.List>
  );
}
