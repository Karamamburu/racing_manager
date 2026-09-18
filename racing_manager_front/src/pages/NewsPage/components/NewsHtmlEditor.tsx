import { useMemo } from 'react';
import JoditEditor from 'jodit-react';
import 'jodit/es2021/jodit.min.css';
import { newsService } from '../../../features/news/newsService';

type NewsHtmlEditorProps = {
  value?: string;
  onChange?: (html: string) => void;
  disabled?: boolean;
};

type EditorSelection = {
  insertImage: (url: string) => void;
  insertHTML: (html: string) => void;
};

type UploaderSuccessData = {
  files?: string[];
  contentType?: string;
  originalName?: string;
};

type UploadResponse = {
  url?: string;
  contentType?: string;
  originalName?: string;
  message?: string;
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
  'uploadVideo',
  'uploadFile',
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

const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function isVideoContent(contentType: string | undefined, url: string): boolean {
  if (contentType?.startsWith('video/')) return true;
  return /\.(mp4|webm|ogv|ogg|mov)(\?|$)/i.test(url);
}

function isImageContent(contentType: string | undefined, url: string): boolean {
  if (contentType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function insertUploadedMedia(
  editor: { s: EditorSelection },
  url: string,
  contentType?: string,
  originalName?: string,
) {
  if (isVideoContent(contentType, url)) {
    editor.s.insertHTML(
      `<p><video src="${url}" controls playsinline preload="metadata"></video></p>`,
    );
    return;
  }
  if (isImageContent(contentType, url)) {
    editor.s.insertImage(url);
    return;
  }
  const label = escapeHtml(originalName || 'Файл');
  editor.s.insertHTML(
    `<p><a href="${url}" download="${label}">${label}</a></p>`,
  );
}

function openPicker(
  accept: string,
  editor: { s: EditorSelection },
) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void newsService
      .uploadMedia(file)
      .then((uploaded) =>
        insertUploadedMedia(
          editor,
          uploaded.url,
          uploaded.contentType,
          uploaded.originalName ?? file.name,
        ),
      )
      .catch((error: unknown) => {
        window.alert(newsService.getErrorMessage(error));
      });
  });
  input.click();
}

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
      enableDragAndDropFileToEditor: true,
      uploader: {
        url: '/api/admin/news/media',
        method: 'POST',
        format: 'json',
        withCredentials: true,
        insertImageAsBase64URI: false,
        filesVariableName: () => 'file',
        isSuccess: (resp: UploadResponse) => Boolean(resp.url),
        getMessage: (resp: UploadResponse) => resp.message ?? '',
        process: (resp: UploadResponse) => ({
          files: resp.url ? [resp.url] : [],
          contentType: resp.contentType ?? '',
          originalName: resp.originalName ?? '',
          error: resp.url ? 0 : 1,
          msg: resp.message ?? '',
        }),
        defaultHandlerSuccess(this: { s: EditorSelection }, data: UploaderSuccessData) {
          const url = data.files?.[0];
          if (!url) return;
          insertUploadedMedia(this, url, data.contentType, data.originalName);
        },
      },
      extraButtons: [
        {
          name: 'uploadVideo',
          icon: 'video',
          tooltip: 'Загрузить видео',
          exec: (editor: { s: EditorSelection }) =>
            openPicker(
              'video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogv,.ogg,.mov',
              editor,
            ),
        },
        {
          name: 'uploadFile',
          icon: 'file',
          tooltip: 'Загрузить документ',
          exec: (editor: { s: EditorSelection }) => openPicker(DOCUMENT_ACCEPT, editor),
        },
      ],
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
