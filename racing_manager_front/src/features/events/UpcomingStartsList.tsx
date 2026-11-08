import { Space, Tag, Typography } from 'antd';
import type { StartResponse } from '../../shared/types/event';
import { formatStartKm, startTotalMeters } from './EventStartBlocks';

const PURPOSE_LABELS: Record<string, string> = {
  CUP_RACE: 'Кубковая гонка',
  CONTROL_TRAINING: 'Контрольная тренировка',
};

export function upcomingStarts(starts: StartResponse[] | undefined): StartResponse[] {
  return [...(starts ?? [])].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
}

export function UpcomingStartsList({ starts }: { starts: StartResponse[] | undefined }) {
  const ordered = upcomingStarts(starts);
  if (ordered.length === 0) return null;

  return (
    <Space direction="vertical" size={4} style={{ paddingLeft: 8 }}>
      {ordered.map((start) => (
        <div key={start.id}>
          <Typography.Text strong>{start.resolvedLabel}</Typography.Text>{' '}
          <Tag>{PURPOSE_LABELS[start.purposeType] ?? start.purposeType}</Tag>
          <Typography.Text type="secondary">
            {formatStartKm(startTotalMeters(start))} км
          </Typography.Text>
        </div>
      ))}
    </Space>
  );
}
