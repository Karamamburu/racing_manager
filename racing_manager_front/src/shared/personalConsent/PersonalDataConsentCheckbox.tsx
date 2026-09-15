import { Checkbox, Form } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const consentLabel: ReactNode = (
  <>
    Даю согласие на обработку персональных данных в соответствии с{' '}
    <Link to="/policy/personal-data" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
      текстом согласия
    </Link>
  </>
);

type FormConsentProps = {
  name?: string;
  checked?: never;
  onChange?: never;
};

type StandaloneConsentProps = {
  name?: never;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function PersonalDataConsentCheckbox(props: FormConsentProps | StandaloneConsentProps) {
  if (props.checked !== undefined) {
    return (
      <Checkbox checked={props.checked} onChange={(event) => props.onChange(event.target.checked)}>
        {consentLabel}
      </Checkbox>
    );
  }

  return (
    <Form.Item
      name={props.name ?? 'personalDataConsent'}
      valuePropName="checked"
      rules={[
        {
          validator: async (_, value) => {
            if (value === true) return;
            throw new Error('Подтвердите согласие на обработку персональных данных');
          },
        },
      ]}
    >
      <Checkbox>{consentLabel}</Checkbox>
    </Form.Item>
  );
}
