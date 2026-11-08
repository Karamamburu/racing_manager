import { Button, Card, Space, Tag, Tooltip, Typography } from 'antd';
import type { EventFormatRef, StartResponse } from '../../shared/types/event';
import { routeColorHeaderStyle } from './routeColors';

const PURPOSE_LABELS: Record<string, string> = {
  CUP_RACE: 'Кубковая гонка',
  CONTROL_TRAINING: 'Контрольная тренировка',
};

export function formatStartKm(meters: number): string {
  const km = meters / 1000;
  if (Number.isInteger(km)) return String(km);
  return km.toFixed(2).replace(/\.?0+$/, '');
}

export function startTotalMeters(start: StartResponse): number {
  return start.legacyEffectiveDistanceM ?? start.displayedDistanceMeters;
}

export function EventStartBlocks({
  starts,
  formats,
  stacked,
  canRegister = false,
  registerDisabled = false,
  registerTooltip,
  onRegister,
}: {
  starts: StartResponse[];
  formats: EventFormatRef[];
  stacked: boolean;
  canRegister?: boolean;
  registerDisabled?: boolean;
  registerTooltip?: string;
  onRegister?: (start: StartResponse, format: EventFormatRef) => void;
}) {
  const ordered = [...starts].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      {ordered.map((start) => {
        const startFormats =
          start.formats?.length
            ? start.formats
            : formats.filter((format) => start.formatIds.includes(format.id));
        return (
          <Card
            key={start.id}
            size="small"
            title={start.resolvedLabel}
            style={{ flex: stacked ? undefined : '1 1 240px' }}
            styles={{ header: routeColorHeaderStyle(start.routeColor) }}
          >
            <Space direction="vertical" size={4}>
              <Typography.Text>
                <Typography.Text type="secondary">Назначение: </Typography.Text>
                {PURPOSE_LABELS[start.purposeType] ?? start.purposeType}
              </Typography.Text>
              <Typography.Text>
                <Typography.Text type="secondary">Круги: </Typography.Text>
                {start.lapCount} × {formatStartKm(start.lapLengthMeters)} км
              </Typography.Text>
              <Typography.Text>
                <Typography.Text type="secondary">Дистанция: </Typography.Text>
                {formatStartKm(startTotalMeters(start))} км
                {start.legacyEffectiveDistanceM != null ? (
                  <Tag style={{ marginLeft: 8 }}>из протокола</Tag>
                ) : null}
              </Typography.Text>
              <Space wrap size={[4, 4]}>
                <Typography.Text type="secondary">Форматы:</Typography.Text>
                {startFormats.length > 0
                  ? startFormats.map((format) =>
                      canRegister && onRegister ? (
                        <Tooltip
                          key={format.id}
                          title={registerDisabled ? registerTooltip : undefined}
                        >
                          <span>
                            <Button
                              size="small"
                              disabled={registerDisabled}
                              onClick={() => onRegister(start, format)}
                            >
                              {format.name}
                            </Button>
                          </span>
                        </Tooltip>
                      ) : (
                        <Tag key={format.id}>{format.name}</Tag>
                      ),
                    )
                  : '—'}
              </Space>
            </Space>
          </Card>
        );
      })}
    </div>
  );
}
