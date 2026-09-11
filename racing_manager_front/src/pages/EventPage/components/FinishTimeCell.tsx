import { Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { formatFinishTime, parseFinishTime } from '../../../shared/formatFinishTime';

type FinishTimeCellProps = {
  value: number | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (timeMilliseconds: number) => Promise<void> | void;
  onInvalid?: () => void;
};

export function FinishTimeCell({
  value,
  canEdit,
  saving,
  onSave,
  onInvalid,
}: FinishTimeCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : formatFinishTime(value));
  const committing = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : formatFinishTime(value));
  }, [editing, value]);

  if (!canEdit) return <>{formatFinishTime(value)}</>;

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
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatFinishTime(value)}
      </button>
    );
  }

  const commit = async () => {
    if (committing.current || saving) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    let parsed: number | null;
    try {
      parsed = parseFinishTime(trimmed);
    } catch {
      onInvalid?.();
      return;
    }
    if (parsed === null || parsed === value) {
      setEditing(false);
      return;
    }
    committing.current = true;
    try {
      await onSave(parsed);
      setEditing(false);
    } catch {
      // Keep the editor open so the time can be corrected.
    } finally {
      committing.current = false;
    }
  };

  return (
    <Input
      autoFocus
      size="small"
      disabled={saving}
      value={draft === '—' ? '' : draft}
      placeholder="мм:сс"
      style={{ width: 110 }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        void commit();
      }}
      onPressEnter={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(value == null ? '' : formatFinishTime(value));
          setEditing(false);
        }
      }}
    />
  );
}
