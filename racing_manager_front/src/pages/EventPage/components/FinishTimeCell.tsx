import { Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  appendDurationDigit,
  finishTimeMsToDigits,
  formatDurationDigits,
  formatFinishTime,
  parseDurationDigits,
} from '../../../shared/formatFinishTime';

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
  const [digits, setDigits] = useState(value == null ? '' : finishTimeMsToDigits(value));
  const committing = useRef(false);
  const handledByKey = useRef(false);
  const replaceNextDigit = useRef(false);

  useEffect(() => {
    if (!editing) setDigits(value == null ? '' : finishTimeMsToDigits(value));
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
    let parsed: number | null;
    try {
      parsed = parseDurationDigits(digits);
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

  const isEntireValueSelected = (target: EventTarget | null) => {
    if (!(target instanceof HTMLInputElement)) return false;
    return target.selectionStart === 0 && target.selectionEnd === target.value.length;
  };

  return (
    <Input
      autoFocus
      size="small"
      disabled={saving}
      value={formatDurationDigits(digits)}
      placeholder="чч:мм:сс"
      inputMode="numeric"
      autoComplete="off"
      style={{ width: 118, fontVariantNumeric: 'tabular-nums' }}
      onFocus={(event) => {
        event.target.select();
        replaceNextDigit.current = true;
      }}
      onChange={(event) => {
        if (handledByKey.current) {
          handledByKey.current = false;
          return;
        }
        const inputType = (event.nativeEvent as InputEvent).inputType ?? '';
        const data = (event.nativeEvent as InputEvent).data ?? '';
        if (inputType.startsWith('delete')) {
          setDigits((current) =>
            replaceNextDigit.current || isEntireValueSelected(event.target)
              ? ''
              : current.slice(0, -1),
          );
          replaceNextDigit.current = false;
          return;
        }
        if (inputType.startsWith('insert')) {
          const nextDigits = data.replace(/\D/g, '');
          if (!nextDigits) return;
          setDigits((current) =>
            replaceNextDigit.current || isEntireValueSelected(event.target)
              ? nextDigits.slice(-6)
              : (current + nextDigits).slice(-6),
          );
          replaceNextDigit.current = false;
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(-6);
        setDigits(pasted);
      }}
      onKeyDown={(event) => {
        if (event.key >= '0' && event.key <= '9') {
          event.preventDefault();
          handledByKey.current = true;
          setDigits((current) =>
            replaceNextDigit.current || isEntireValueSelected(event.target)
              ? event.key
              : appendDurationDigit(current, event.key),
          );
          replaceNextDigit.current = false;
          return;
        }
        if (event.key === 'Backspace') {
          event.preventDefault();
          handledByKey.current = true;
          setDigits((current) =>
            replaceNextDigit.current || isEntireValueSelected(event.target)
              ? ''
              : current.slice(0, -1),
          );
          replaceNextDigit.current = false;
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          void commit();
          return;
        }
        if (event.key === 'Escape') {
          setDigits(value == null ? '' : finishTimeMsToDigits(value));
          setEditing(false);
        }
      }}
      onBlur={() => {
        void commit();
      }}
    />
  );
}
