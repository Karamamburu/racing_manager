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
  omit?: readonly RegistrationStatusCode[];
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
  omit,
  onChange,
}: RegistrationStatusSelectProps) {
  return (
    <Select
      value={isRegistrationStatus(value) ? value : undefined}
      loading={loading}
      disabled={disabled}
      options={omit?.length ? options.filter((option) => !omit.includes(option.value)) : options}
      popupMatchSelectWidth={false}
      style={{ minWidth: 260 }}
      placeholder={
        isRegistrationStatus(value) ? REGISTRATION_STATUS_META[value].text : value
      }
      onChange={onChange}
    />
  );
}
