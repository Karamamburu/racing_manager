import { Card, Typography } from 'antd';
import { toNakarteEmbedUrl } from '../../../shared/nakarteMapLink';

type EventTrackMapProps = {
  mapLink: string;
};

export function EventTrackMap({ mapLink }: EventTrackMapProps) {
  return (
    <Card
      title="Карта трассы"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      extra={
        <Typography.Link href={mapLink} target="_blank" rel="noreferrer">
          Открыть на nakarte.me
        </Typography.Link>
      }
      styles={{
        body: {
          padding: 0,
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          minHeight: 420,
        },
      }}
    >
      <iframe
        src={toNakarteEmbedUrl(mapLink)}
        title="Карта трассы"
        className="event-track-map"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </Card>
  );
}
