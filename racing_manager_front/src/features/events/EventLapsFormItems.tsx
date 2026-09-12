import { Form, InputNumber } from 'antd';
import { MAX_EVENT_LAP_COUNT } from './eventLaps';

type EventLapsFormValues = {
  lapCount?: number | null;
  lapDistanceKm?: number | null;
};

export function EventLapsFormItems() {
  const form = Form.useFormInstance<EventLapsFormValues>();
  const lapCount = Form.useWatch('lapCount', form) as number | null | undefined;
  const lapDistanceKm = Form.useWatch('lapDistanceKm', form) as number | null | undefined;
  const total =
    typeof lapCount === 'number' && typeof lapDistanceKm === 'number'
      ? Number((lapCount * lapDistanceKm).toFixed(2))
      : undefined;

  return (
    <>
      <Form.Item<EventLapsFormValues>
        name="lapCount"
        label="Количество кругов"
        rules={[{ required: true, message: 'Укажите количество кругов' }]}
      >
        <InputNumber min={1} max={MAX_EVENT_LAP_COUNT} precision={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item<EventLapsFormValues>
        name="lapDistanceKm"
        label="Длина круга, км"
        extra="Длина одного круга. Итоговая дистанция считается автоматически."
        rules={[{ required: true, message: 'Укажите длину круга' }]}
      >
        <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} placeholder="2.5" />
      </Form.Item>

      <Form.Item label="Дистанция, км">
        <InputNumber disabled value={total} style={{ width: '100%' }} placeholder="Сумма кругов" />
      </Form.Item>
    </>
  );
}
