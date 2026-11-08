import type { RouteColorCode } from '../../shared/types/event';

export type RouteColorOption = {
  code: RouteColorCode;
  label: string;
  rgb: readonly [number, number, number];
};

export const ROUTE_COLORS: readonly RouteColorOption[] = [
  { code: 'BLUE', label: 'Синий', rgb: [119, 119, 255] },
  { code: 'ORANGE', label: 'Оранжевый', rgb: [255, 153, 85] },
  { code: 'CYAN', label: 'Голубой', rgb: [0, 255, 255] },
  { code: 'RED', label: 'Красный', rgb: [255, 119, 119] },
  { code: 'MAGENTA', label: 'Розовый', rgb: [255, 119, 255] },
  { code: 'YELLOW', label: 'Жёлтый', rgb: [238, 238, 85] },
];

export function routeColorOption(
  code: RouteColorCode | null | undefined,
): RouteColorOption | undefined {
  return code ? ROUTE_COLORS.find((color) => color.code === code) : undefined;
}

export function routeColorCss(
  code: RouteColorCode | null | undefined,
): string | null {
  const color = routeColorOption(code);
  return color ? `rgb(${color.rgb.join(', ')})` : null;
}

export function routeColorHeaderStyle(
  code: RouteColorCode | null | undefined,
): { backgroundColor: string } | undefined {
  const color = routeColorOption(code);
  return color
    ? { backgroundColor: `rgba(${color.rgb.join(', ')}, 0.5)` }
    : undefined;
}
