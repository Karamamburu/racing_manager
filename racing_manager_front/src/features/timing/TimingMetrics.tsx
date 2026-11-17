import { Card, Space, Tooltip, Typography } from 'antd';
import type { TimingSurfaceView } from './types';
import { computeTimingMetrics, type TimingMetrics } from './timingMetricsModel';

type MetricTone = 'default' | 'blue' | 'green' | 'orange';

const TONE_COLORS: Record<MetricTone, string | undefined> = {
  default: undefined,
  blue: '#1677ff',
  green: '#389e0d',
  orange: '#d46b08',
};

function MetricRow({
  label,
  value,
  note,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  note?: string;
  hint: string;
  tone?: MetricTone;
}) {
  return (
    <Tooltip title={hint} placement="top">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          cursor: 'help',
        }}
      >
        <Typography.Text type="secondary">{label}</Typography.Text>
        <div style={{ textAlign: 'right' }}>
          <Typography.Text strong style={{ color: TONE_COLORS[tone] }}>
            {value}
          </Typography.Text>
          {note === undefined ? null : (
            <Typography.Text
              type="secondary"
              style={{ display: 'block', fontSize: 12 }}
            >
              {note}
            </Typography.Text>
          )}
        </div>
      </div>
    </Tooltip>
  );
}

/**
 * The compact referee summary beside the capture controls. Every value comes
 * from the loaded surface, so the widget adds no request and no write.
 */
export function TimingMetricsPanel({
  surface,
}: {
  surface: TimingSurfaceView;
}) {
  const metrics: TimingMetrics = computeTimingMetrics(surface);
  const attention = metrics.pendingSplits + metrics.pendingFinishes;
  return (
    <Card
      size="small"
      type="inner"
      title="Ход хронометража"
      style={{ height: '100%' }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <MetricRow
          label="Категории"
          value={`${metrics.categoriesFinished} из ${metrics.categoriesTotal} завершено`}
          note={
            metrics.categoriesNotStarted > 0
              ? `не начато: ${metrics.categoriesNotStarted}`
              : undefined
          }
          hint="Завершена та категория, у которой закрыта гонка в протоколе. В скобках — ещё не начатые."
        />
        <MetricRow
          label="Участники"
          value={`${metrics.participantsFinished} из ${metrics.participantsTotal} финишировали`}
          hint="Финишировал тот, у кого собраны все отсечки. Участники вне хронометража в счёт не входят."
        />
        <MetricRow
          label="На дистанции"
          value={String(metrics.onCourse)}
          tone={metrics.onCourse > 0 ? 'blue' : 'default'}
          hint="Участники, которые уже стартовали, но ещё не собрали все отсечки."
        />
        <MetricRow
          label="Готовы к завершению"
          value={String(metrics.readyToComplete)}
          tone={metrics.readyToComplete > 0 ? 'blue' : 'default'}
          hint="Категории и заезды, где собраны все отсечки и нет непривязанных финишей."
        />
        <MetricRow
          label="Требуют внимания"
          value={String(attention)}
          note={
            attention > 0
              ? `отсечки: ${metrics.pendingSplits} · финиши: ${metrics.pendingFinishes}`
              : undefined
          }
          tone={attention > 0 ? 'orange' : 'default'}
          hint="Неприсвоенные отсечки и непривязанные финиши. Пока они есть, попытку нельзя закрыть."
        />
        <MetricRow
          label="Осталось отсечек"
          value={String(metrics.remainingPasses)}
          tone={metrics.remainingPasses > 0 ? 'blue' : 'green'}
          hint="Сколько отсечек ещё нужно получить в идущих категориях и заездах."
        />
      </Space>
    </Card>
  );
}
