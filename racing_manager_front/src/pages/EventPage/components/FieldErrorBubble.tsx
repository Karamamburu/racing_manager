import { Popover } from 'antd';
import type { ReactNode } from 'react';

type FieldErrorBubbleProps = {
  message: string | null;
  children: ReactNode;
};

export function errorBubbleText(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const text = error.message.trim();
    if (text && !text.startsWith('Request failed') && text !== 'Network Error') return text;
  }
  return fallback;
}

export function FieldErrorBubble({ message, children }: FieldErrorBubbleProps) {
  return (
    <Popover
      open={message != null}
      placement="topLeft"
      color="#cf1322"
      arrow
      rootClassName="field-error-bubble"
      getPopupContainer={() => document.body}
      content={
        <span role="alert" style={{ color: '#fff', fontSize: 13, lineHeight: 1.35 }}>
          {message}
        </span>
      }
      styles={{
        root: { zIndex: 2000 },
        body: { padding: '6px 10px', maxWidth: 280 },
      }}
    >
      <span style={{ display: 'inline-block', maxWidth: '100%' }}>{children}</span>
    </Popover>
  );
}
