import { PlusOutlined } from '@ant-design/icons';
import { Button, Space, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { useState } from 'react';
import { newsService } from '../../../features/news/newsService';

type NewsCoverImageFieldProps = {
  value?: string | null;
  onChange?: (url: string | null) => void;
};

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';

export function NewsCoverImageField({ value, onChange }: NewsCoverImageFieldProps) {
  const [uploading, setUploading] = useState(false);

  const customRequest: UploadProps['customRequest'] = async (options) => {
    const file = options.file as File;
    if (!file.type.startsWith('image/')) {
      const error = new Error('Заглавной может быть только картинка');
      message.error(error.message);
      options.onError?.(error);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await newsService.uploadMedia(file);
      if (!uploaded.contentType.startsWith('image/')) {
        const error = new Error('Заглавной может быть только картинка');
        message.error(error.message);
        options.onError?.(error);
        return;
      }
      onChange?.(uploaded.url);
      options.onSuccess?.(uploaded);
    } catch (error) {
      message.error(newsService.getErrorMessage(error));
      options.onError?.(error as Error);
    } finally {
      setUploading(false);
    }
  };

  const uploader = (
    <Upload
      accept={IMAGE_ACCEPT}
      showUploadList={false}
      maxCount={1}
      disabled={uploading}
      customRequest={customRequest}
    >
      <Button icon={<PlusOutlined />} loading={uploading}>
        {value ? 'Заменить' : 'Загрузить картинку'}
      </Button>
    </Upload>
  );

  return (
    <div className="news-cover-field">
      {value ? (
        <div className="news-cover-field__preview">
          <span className="news-headline__cover news-headline__cover--article">
            <img src={value} alt="" />
          </span>
          <Space>
            {uploader}
            <Button onClick={() => onChange?.(null)}>Убрать</Button>
          </Space>
        </div>
      ) : (
        uploader
      )}
    </div>
  );
}
