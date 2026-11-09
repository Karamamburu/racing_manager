import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space } from 'antd';
import {
  emptyProtocolFilters,
  hasActiveProtocolFilters,
  type ProtocolFilters as ProtocolFiltersValue,
} from '../../../features/events/protocolFilters';

type ProtocolFiltersProps = {
  value: ProtocolFiltersValue;
  cityOptions: string[];
  teamOptions: string[];
  onChange: (next: ProtocolFiltersValue) => void;
};

function toOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

export function ProtocolFilters({
  value,
  cityOptions,
  teamOptions,
  onChange,
}: ProtocolFiltersProps) {
  return (
    <Space wrap size={8} style={{ width: '100%' }}>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Поиск по участнику"
        aria-label="Поиск по участнику"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
        style={{ width: 260 }}
      />
      <Select
        mode="multiple"
        allowClear
        placeholder="Город"
        aria-label="Фильтр по городу"
        value={value.cities}
        options={toOptions(cityOptions)}
        onChange={(cities) => onChange({ ...value, cities })}
        maxTagCount="responsive"
        style={{ minWidth: 180, maxWidth: 280 }}
      />
      <Select
        mode="multiple"
        allowClear
        placeholder="Команда"
        aria-label="Фильтр по команде"
        value={value.teams}
        options={toOptions(teamOptions)}
        onChange={(teams) => onChange({ ...value, teams })}
        maxTagCount="responsive"
        style={{ minWidth: 180, maxWidth: 280 }}
      />
      {hasActiveProtocolFilters(value) ? (
        <Button onClick={() => onChange(emptyProtocolFilters)}>
          Сбросить фильтры
        </Button>
      ) : null}
    </Space>
  );
}
