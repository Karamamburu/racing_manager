import { SearchOutlined } from '@ant-design/icons';
import { Card, Col, Input, Row, Select } from 'antd';
import type { TrackFilterOption } from '../../../shared/types/tracks';

type TracksFiltersProps = {
  cityOptions: TrackFilterOption[];
  sportOptions: TrackFilterOption[];
};

export function TracksFilters({ cityOptions, sportOptions }: TracksFiltersProps) {
  return (
    <Card title="Фильтры и поиск">
      <Row gutter={[12, 12]}>
        <Col xs={24} md={10}>
          <Input placeholder="Название трассы" prefix={<SearchOutlined />} />
        </Col>
        <Col xs={12} md={7}>
          <Select
            style={{ width: '100%' }}
            defaultValue={cityOptions[0]?.value}
            options={cityOptions}
          />
        </Col>
        <Col xs={12} md={7}>
          <Select
            style={{ width: '100%' }}
            defaultValue={sportOptions[0]?.value}
            options={sportOptions}
          />
        </Col>
      </Row>
    </Card>
  );
}
