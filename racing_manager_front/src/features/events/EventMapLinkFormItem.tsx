import { Form, Input } from 'antd';
import { validateNakarteMapLink } from '../../shared/nakarteMapLink';

export function EventMapLinkFormItem() {
  return (
    <Form.Item
      name="mapLink"
      label="Ссылка на карту трассы"
      extra="Скопируйте ссылку на трек с nakarte.me. Необязательно."
      rules={[{ validator: validateNakarteMapLink }]}
    >
      <Input allowClear placeholder="https://nakarte.me/#nktl=..." />
    </Form.Item>
  );
}
