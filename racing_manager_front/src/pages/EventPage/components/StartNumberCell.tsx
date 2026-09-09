import { InputNumber } from 'antd';
import { useEffect, useRef, useState } from 'react';

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
  const [editing, setEditing] = useState(false);
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
          color: '#177ddc',
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
      setEditing(false);
      return;
    }
    committing.current = true;
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Keep the editor open so the number can be corrected.
    } finally {
      committing.current = false;
    }
  };

  return (
    <InputNumber
      autoFocus
      min={1}
      precision={0}
      size="small"
      disabled={saving}
      value={draft}
      onChange={(next) => setDraft(next)}
      onBlur={() => {
        void commit();
      }}
      onPressEnter={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
