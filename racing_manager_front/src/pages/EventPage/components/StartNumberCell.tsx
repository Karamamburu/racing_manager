import { InputNumber, theme } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { errorBubbleText, FieldErrorBubble } from './FieldErrorBubble';

type StartNumberCellProps = {
  value: number | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (startNumber: number) => Promise<void> | void;
};

export function StartNumberCell({
  value,
  canEdit,
  saving,
  onSave,
}: StartNumberCellProps) {
  const { token } = theme.useToken();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(value);
  const committing = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  if (!canEdit) return <>{value ?? '—'}</>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          padding: 0,
          border: 'none',
          background: 'none',
          color: token.colorPrimary,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        {value ?? '—'}
      </button>
    );
  }

  const commit = async () => {
    if (committing.current || saving) return;
    if (draft === null || draft === value) {
      setError(null);
      setEditing(false);
      return;
    }
    committing.current = true;
    try {
      await onSave(draft);
      setError(null);
      setEditing(false);
    } catch (saveError) {
      setError(errorBubbleText(saveError, 'Не удалось выдать номер'));
    } finally {
      committing.current = false;
    }
  };

  return (
    <FieldErrorBubble message={error}>
      <InputNumber
        autoFocus
        min={1}
        precision={0}
        size="small"
        status={error ? 'error' : undefined}
        disabled={saving}
        value={draft}
        onChange={(next) => {
          setError(null);
          setDraft(next);
        }}
        onBlur={() => {
          void commit();
        }}
        onPressEnter={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setError(null);
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    </FieldErrorBubble>
  );
}
