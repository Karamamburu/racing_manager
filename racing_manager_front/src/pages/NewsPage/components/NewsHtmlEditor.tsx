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
};

type UploadResponse = {
  url?: string;
  contentType?: string;
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

function isVideoContent(contentType: string | undefined, url: string): boolean {
  if (contentType?.startsWith('video/')) return true;
  return /\.(mp4|webm|ogv|ogg|mov)(\?|$)/i.test(url);
}

function insertUploadedMedia(editor: { s: EditorSelection }, url: string, contentType?: string) {
  if (isVideoContent(contentType, url)) {
    editor.s.insertHTML(
      `<p><video src="${url}" controls playsinline preload="metadata"></video></p>`,
    );
    return;
  }
  editor.s.insertImage(url);
}

function openVideoPicker(editor: { s: EditorSelection }) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogv,.ogg,.mov';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void newsService
      .uploadMedia(file)
      .then((uploaded) => insertUploadedMedia(editor, uploaded.url, uploaded.contentType))
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
          error: resp.url ? 0 : 1,
          msg: resp.message ?? '',
        }),
        defaultHandlerSuccess(this: { s: EditorSelection }, data: UploaderSuccessData) {
          const url = data.files?.[0];
          if (!url) return;
          insertUploadedMedia(this, url, data.contentType);
        },
      },
      extraButtons: [
        {
          name: 'uploadVideo',
          icon: 'video',
          tooltip: 'Загрузить видео',
          exec: (editor: { s: EditorSelection }) => openVideoPicker(editor),
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
