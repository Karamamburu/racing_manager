import { Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  appendDurationDigit,
  finishTimeMsToDigits,
  formatDurationDigits,
  formatFinishTime,
  parseDurationDigits,
} from '../../../shared/formatFinishTime';
import { errorBubbleText, FieldErrorBubble } from './FieldErrorBubble';

const INVALID_TIME = 'Минуты и секунды — до 59. Например, 13215 → 01:32:15';

type FinishTimeCellProps = {
  value: number | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (timeMilliseconds: number) => Promise<void> | void;
};

export function FinishTimeCell({
  value,
  canEdit,
  saving,
  onSave,
}: FinishTimeCellProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(INVALID_TIME);
      return;
    }
    const raw = digits.replace(/\D/g, '');
    if (parsed === null) {
      if (raw.length > 0) {
        setError('Время должно быть больше нуля');
        return;
      }
      setError(null);
      setEditing(false);
      return;
    }
    if (parsed === value) {
      setError(null);
      setEditing(false);
      return;
    }
    committing.current = true;
    try {
      await onSave(parsed);
      setError(null);
      setEditing(false);
    } catch (saveError) {
      setError(errorBubbleText(saveError, 'Не удалось записать время'));
    } finally {
      committing.current = false;
    }
  };

  const isEntireValueSelected = (target: EventTarget | null) => {
    if (!(target instanceof HTMLInputElement)) return false;
    return target.selectionStart === 0 && target.selectionEnd === target.value.length;
  };

  return (
    <FieldErrorBubble message={error}>
      <Input
        autoFocus
        size="small"
        status={error ? 'error' : undefined}
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
            setError(null);
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
            setError(null);
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
          setError(null);
          const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(-6);
          setDigits(pasted);
        }}
        onKeyDown={(event) => {
          if (event.key >= '0' && event.key <= '9') {
            event.preventDefault();
            handledByKey.current = true;
            setError(null);
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
            setError(null);
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
            setError(null);
            setDigits(value == null ? '' : finishTimeMsToDigits(value));
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
      />
    </FieldErrorBubble>
  );
}
