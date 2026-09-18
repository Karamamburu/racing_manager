import { Alert, Button, Card, Form, Input, Result, Select, Skeleton, Space } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '../../features/auth/authService';
import { canManageNews } from '../../features/auth/canManageNews';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { isNewsBodyEmpty } from '../../features/news/sanitizeNewsHtml';
import { newsService } from '../../features/news/newsService';
import { newsArticleQueryKey, useNewsArticleQuery } from '../../features/news/useNewsArticleQuery';
import { newsListQueryKey } from '../../features/news/useNewsListQuery';
import { useCatalogTracksQuery } from '../../features/tracks/useCatalogTracksQuery';
import { AppShell } from '../../shared/layout';
import { NewsHtmlEditor } from './components/NewsHtmlEditor';
import { NewsCoverImageField } from './components/NewsCoverImageField';

type NewsEditorFormValues = {
  trackId: string;
  title: string;
  body: string;
  coverImageUrl: string | null;
};

type FeedbackStatus = 'unauthorized' | 'forbidden' | 'error';

type FeedbackState = {
  status: FeedbackStatus;
  title: string;
  subtitle?: string;
};

export function NewsEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<NewsEditorFormValues>();
  const sessionQuery = useSessionQuery();
  const tracksQuery = useCatalogTracksQuery();
  const articleQuery = useNewsArticleQuery(id);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const canManage = canManageNews(sessionQuery.data?.roles);
  const tracks = tracksQuery.data ?? [];

  useEffect(() => {
    if (!isEdit || !articleQuery.data) return;
    form.setFieldsValue({
      trackId: articleQuery.data.track.id,
      title: articleQuery.data.title,
      body: articleQuery.data.body,
      coverImageUrl: articleQuery.data.coverImageUrl,
    });
  }, [articleQuery.data, form, isEdit]);

  useEffect(() => {
    if (isEdit || tracks.length === 0) return;
    if (!form.getFieldValue('trackId')) {
      form.setFieldValue('trackId', tracks[0].id);
    }
  }, [form, isEdit, tracks]);

  const handleFinish = async (values: NewsEditorFormValues) => {
    setSubmitting(true);
    setFeedback(null);
    const payload = {
      trackId: values.trackId,
      title: values.title.trim(),
      body: values.body,
      coverImageUrl: values.coverImageUrl ?? null,
    };
    try {
      const result = isEdit && id
        ? await newsService.update(id, payload)
        : await newsService.create(payload);
      await queryClient.invalidateQueries({ queryKey: newsListQueryKey });
      if (isEdit && id) {
        await queryClient.invalidateQueries({ queryKey: newsArticleQueryKey(id) });
      }
      navigate(`/news/${result.data.id}`);
    } catch (error) {
      const status = newsService.getStatus(error);
      if (status === 401) {
        setFeedback({
          status: 'unauthorized',
          title: 'Неаутентифицирован',
          subtitle: 'Сессия недействительна или истекла. Войдите в систему ещё раз.',
        });
        return;
      }
      if (status === 403) {
        setFeedback({
          status: 'forbidden',
          title: 'Недостаточно прав',
          subtitle: 'Создавать и редактировать новости может только администратор.',
        });
        return;
      }
      setFeedback({
        status: 'error',
        title: isEdit ? 'Не удалось сохранить новость' : 'Не удалось создать новость',
        subtitle: newsService.getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionQuery.isLoading || (isEdit && articleQuery.isLoading)) {
    return (
      <AppShell title={isEdit ? 'Редактирование новости' : 'Новая новость'} subtitle="Редактор статьи">
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </AppShell>
    );
  }

  if (!canManage) {
    return (
      <AppShell title="Новости" subtitle="Редактор статьи">
        <Result
          status="403"
          title="Недостаточно прав"
          subTitle="Создавать и редактировать новости может только администратор."
          extra={
            <Space>
              <Button onClick={() => navigate('/news')}>К новостям</Button>
              {!sessionQuery.data?.authenticated ? (
                <Button type="primary" onClick={() => authService.startLoginFlow()}>
                  Войти
                </Button>
              ) : null}
            </Space>
          }
        />
      </AppShell>
    );
  }

  if (isEdit && (articleQuery.isError || !articleQuery.data)) {
    return (
      <AppShell title="Редактирование новости" subtitle="Статья не найдена">
        <Result
          status="404"
          title="Новость не найдена"
          extra={
            <Button type="primary" onClick={() => navigate('/news')}>
              Ко всем новостям
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={isEdit ? 'Редактирование новости' : 'Новая новость'}
      subtitle="Статья с привязкой к трассе"
    >
      <Card>
        {tracksQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="Не удалось загрузить список трасс"
            action={
              <Button size="small" type="primary" onClick={() => tracksQuery.refetch()}>
                Повторить
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {feedback ? (
          <Result
            status={feedback.status === 'unauthorized' ? 'warning' : feedback.status === 'forbidden' ? '403' : 'error'}
            title={feedback.title}
            subTitle={feedback.subtitle}
            extra={
              feedback.status === 'unauthorized' ? (
                <Space>
                  <Button onClick={() => setFeedback(null)}>Закрыть</Button>
                  <Button type="primary" onClick={() => authService.startLoginFlow()}>
                    Войти
                  </Button>
                </Space>
              ) : (
                <Button type="primary" onClick={() => setFeedback(null)}>
                  Хорошо
                </Button>
              )
            }
          />
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            initialValues={
              isEdit && articleQuery.data
                ? {
                    trackId: articleQuery.data.track.id,
                    title: articleQuery.data.title,
                    body: articleQuery.data.body,
                    coverImageUrl: articleQuery.data.coverImageUrl,
                  }
                : { coverImageUrl: null }
            }
          >
            <Form.Item
              name="trackId"
              label="Трасса"
              rules={[{ required: true, message: 'Выберите трассу' }]}
            >
              <Select
                placeholder="Выберите трассу"
                loading={tracksQuery.isLoading}
                options={tracks.map((track) => ({
                  value: track.id,
                  label: track.locationCity ? `${track.name} (${track.locationCity})` : track.name,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="title"
              label="Заголовок"
              rules={[{ required: true, message: 'Укажите заголовок' }]}
            >
              <Input placeholder="Сезон в Алёшкино открыт" maxLength={200} />
            </Form.Item>

            <Form.Item
              name="coverImageUrl"
              label="Заглавная картинка"
              extra="Необязательно. Показывается слева от заголовка в списке и в самой новости."
            >
              <NewsCoverImageField />
            </Form.Item>

            <Form.Item
              name="body"
              label="Текст"
              extra="Изображения, видео и документы (pdf, doc, docx, xls, xlsx) загружаются в хранилище. Документы вставляются ссылкой на скачивание."
              rules={[
                {
                  validator: (_, value: string) =>
                    isNewsBodyEmpty(value)
                      ? Promise.reject(new Error('Добавьте текст новости'))
                      : Promise.resolve(),
                },
              ]}
            >
              <NewsHtmlEditor />
            </Form.Item>

            <Space>
              <Button onClick={() => navigate(isEdit && id ? `/news/${id}` : '/news')}>Отмена</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {isEdit ? 'Сохранить' : 'Опубликовать'}
              </Button>
            </Space>
          </Form>
        )}
      </Card>
    </AppShell>
  );
}
