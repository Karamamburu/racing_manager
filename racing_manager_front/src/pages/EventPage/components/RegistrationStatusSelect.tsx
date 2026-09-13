import { Select, Tag } from 'antd';
import {
  MANAGEABLE_REGISTRATION_STATUSES,
  REGISTRATION_STATUS_META,
  isRegistrationStatus,
  type RegistrationStatusCode,
} from '../../../shared/registrationStatus';

type RegistrationStatusSelectProps = {
  value: string;
  loading?: boolean;
  disabled?: boolean;
  onChange: (status: RegistrationStatusCode) => void;
};

const options = MANAGEABLE_REGISTRATION_STATUSES.map((status) => ({
  value: status,
  label: (
    <Tag color={REGISTRATION_STATUS_META[status].color} style={{ marginInlineEnd: 0 }}>
      {REGISTRATION_STATUS_META[status].text}
    </Tag>
  ),
}));

export function RegistrationStatusSelect({
  value,
  loading,
  disabled,
  onChange,
}: RegistrationStatusSelectProps) {
  return (
    <Select
      value={isRegistrationStatus(value) ? value : undefined}
      loading={loading}
      disabled={disabled}
      options={options}
      popupMatchSelectWidth={false}
      style={{ minWidth: 260 }}
      placeholder={
        isRegistrationStatus(value) ? REGISTRATION_STATUS_META[value].text : value
      }
      onChange={onChange}
    />
  );
}
