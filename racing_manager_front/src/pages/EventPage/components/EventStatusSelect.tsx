import { Select, Tag } from 'antd';
import {
  EVENT_STATUSES,
  EVENT_STATUS_META,
  isEventStatus,
  type EventStatusCode,
} from '../../../shared/eventStatus';

type EventStatusSelectProps = {
  value: string;
  loading?: boolean;
  disabled?: boolean;
  onChange: (status: EventStatusCode) => void;
};

const options = EVENT_STATUSES.map((status) => ({
  value: status,
  label: (
    <Tag color={EVENT_STATUS_META[status].color} style={{ marginInlineEnd: 0 }}>
      {EVENT_STATUS_META[status].text}
    </Tag>
  ),
}));

export function EventStatusSelect({
  value,
  loading,
  disabled,
  onChange,
}: EventStatusSelectProps) {
  return (
    <Select
      value={isEventStatus(value) ? value : undefined}
      loading={loading}
      disabled={disabled}
      options={options}
      style={{ minWidth: 180 }}
      placeholder={isEventStatus(value) ? EVENT_STATUS_META[value].text : value}
      onChange={onChange}
    />
  );
}
