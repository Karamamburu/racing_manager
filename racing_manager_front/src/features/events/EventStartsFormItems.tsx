import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { useState } from 'react';
import type {
  ParticipationFormat,
  RouteColorCode,
  StartInputRequest,
  StartPurposeType,
} from '../../shared/types/event';
import { ROUTE_COLORS } from './routeColors';

export type StartFormValue = {
  id?: string;
  purposeType: StartPurposeType;
  formatIds: number[];
  lapCount: number;
  lapLengthKm: number;
  displayName?: string | null;
  routeColor?: RouteColorCode | null;
  legacyEffectiveDistanceM?: number | null;
};

const purposeOptions = [
  { value: 'CUP_RACE', label: 'Кубковая гонка' },
  { value: 'CONTROL_TRAINING', label: 'Контрольная тренировка' },
];

function displayDistanceKm(start: StartFormValue | undefined): string {
  if (!start) return '—';
  const meters =
    start.legacyEffectiveDistanceM ??
    Math.round(Number(start.lapLengthKm ?? 0) * 1000) *
      Math.trunc(Number(start.lapCount ?? 0));
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(2).replace(/\.?0+$/, '')} км`;
}

export function defaultStartValue(
  formats: ParticipationFormat[],
): StartFormValue {
  return {
    purposeType: 'CUP_RACE',
    formatIds: formats.map((format) => format.id),
    lapCount: 1,
    lapLengthKm: 1,
    displayName: null,
  };
}

export function buildStartsPayload(
  starts: StartFormValue[],
): StartInputRequest[] {
  return starts.map((start, index) => ({
    ...(start.id ? { id: start.id } : {}),
    purposeType: start.purposeType ?? 'CUP_RACE',
    formatIds: [...(start.formatIds ?? [])],
    lapCount: Math.trunc(Number(start.lapCount)),
    lapLengthMeters: Math.round(Number(start.lapLengthKm) * 1000),
    displayName: start.displayName?.trim() ? start.displayName.trim() : null,
    routeColor: start.routeColor ?? null,
    sortOrder: index,
  }));
}

export function EventStartsFormItems({
  formats,
  activeIndex,
  onActiveIndexChange,
}: {
  formats: ParticipationFormat[];
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}) {
  const form = Form.useFormInstance();
  const starts = Form.useWatch('starts', form) as StartFormValue[] | undefined;
  const [internalActive, setInternalActive] = useState(0);
  const active = activeIndex ?? internalActive;
  const setActive = onActiveIndexChange ?? setInternalActive;

  return (
    <Form.List name="starts">
      {(fields, { add, remove }) => {
        const current = Math.min(
          Math.max(active, 0),
          Math.max(fields.length - 1, 0),
        );
        const items = fields.map((field, index) => ({
          key: String(field.key),
          label: `Старт ${index + 1}`,
          forceRender: true,
          children: (
            <Card size="small" variant="borderless">
              <Form.Item name={[field.name, 'id']} hidden>
                <Input />
              </Form.Item>

              <Form.Item
                name={[field.name, 'displayName']}
                label="Название"
                extra="Если не заполнить, название построится автоматически по назначению и дистанции."
              >
                <Input placeholder="Например, Тушино" />
              </Form.Item>

              <Form.Item
                name={[field.name, 'routeColor']}
                label="Цвет маршрута"
                extra="Должен совпадать с цветом маршрута на nakarte.me"
              >
                <Select
                  allowClear
                  placeholder="Без цвета"
                  options={ROUTE_COLORS.map((color) => ({
                    value: color.code,
                    label: (
                      <span>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 14,
                            height: 14,
                            marginRight: 8,
                            borderRadius: 3,
                            verticalAlign: 'middle',
                            backgroundColor: `rgb(${color.rgb.join(', ')})`,
                          }}
                        />
                        {color.label}
                      </span>
                    ),
                  }))}
                />
              </Form.Item>

              <Form.Item
                name={[field.name, 'purposeType']}
                label="Тип старта"
                rules={[{ required: true, message: 'Выберите тип старта' }]}
              >
                <Select options={purposeOptions} />
              </Form.Item>

              <Form.Item
                name={[field.name, 'formatIds']}
                label="Форматы участия"
                rules={[
                  { type: 'array', min: 1, message: 'Выберите хотя бы один формат' },
                ]}
              >
                <Checkbox.Group
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  options={formats.map((format) => ({
                    label: format.name,
                    value: format.id,
                  }))}
                />
              </Form.Item>

              <Space size="middle" align="start">
                <Form.Item
                  name={[field.name, 'lapCount']}
                  label="Кругов"
                  rules={[{ required: true, message: 'Укажите число кругов' }]}
                >
                  <InputNumber min={1} precision={0} />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'lapLengthKm']}
                  label="Длина круга, км"
                  rules={[{ required: true, message: 'Укажите длину круга' }]}
                >
                  <InputNumber min={0.001} step={0.1} precision={3} />
                </Form.Item>
              </Space>

              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Дистанция: {displayDistanceKm(starts?.[field.name])}
                {starts?.[field.name]?.legacyEffectiveDistanceM != null
                  ? ' (из протокола)'
                  : ''}
              </Typography.Text>

              {fields.length > 1 ? (
                <Button
                  danger
                  onClick={() => {
                    remove(field.name);
                    setActive(Math.max(0, index - 1));
                  }}
                >
                  Удалить старт
                </Button>
              ) : null}
            </Card>
          ),
        }));

        return (
          <Tabs
            activeKey={String(fields[current]?.key ?? '')}
            onChange={(key) => {
              const index = fields.findIndex(
                (field) => String(field.key) === key,
              );
              if (index >= 0) setActive(index);
            }}
            items={items}
            tabBarExtraContent={
              <Button
                type="dashed"
                onClick={() => {
                  add(defaultStartValue(formats));
                  setActive(fields.length);
                }}
              >
                + Добавить старт
              </Button>
            }
          />
        );
      }}
    </Form.List>
  );
}
