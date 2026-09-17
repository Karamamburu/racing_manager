import { useMemo } from 'react';
import JoditEditor from 'jodit-react';
import 'jodit/es2021/jodit.min.css';

type NewsHtmlEditorProps = {
  value?: string;
  onChange?: (html: string) => void;
  disabled?: boolean;
};

const BUTTONS = [
  'undo',
  'redo',
  '|',
  'paragraph',
  'font',
  'fontsize',
  '|',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  '|',
  'brush',
  '|',
  'ul',
  'ol',
  'indent',
  'outdent',
  '|',
  'align',
  '|',
  'link',
  'image',
  'table',
  'hr',
  '|',
  'superscript',
  'subscript',
  '|',
  'eraser',
  'fullsize',
  'preview',
] as const;

export function NewsHtmlEditor({ value = '', onChange, disabled }: NewsHtmlEditorProps) {
  const config = useMemo(
    () => ({
      language: 'ru',
      readonly: Boolean(disabled),
      height: 480,
      minHeight: 360,
      toolbarAdaptive: false,
      toolbarSticky: true,
      showCharsCounter: false,
      showWordsCounter: false,
      showXPathInStatusbar: false,
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      defaultActionOnPaste: 'insert_clear_html' as const,
      uploader: {
        insertImageAsBase64URI: false,
      },
      buttons: [...BUTTONS],
      buttonsMD: [...BUTTONS],
      buttonsSM: [...BUTTONS],
      placeholder: 'Текст новости',
    }),
    [disabled],
  );

  return (
    <JoditEditor
      value={value}
      config={config}
      onBlur={(html) => onChange?.(html)}
      onChange={(html) => onChange?.(html)}
    />
  );
}
