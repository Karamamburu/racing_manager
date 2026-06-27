import { MetricStats } from '../../../shared/components';
import type { TracksStat } from '../../../shared/types/tracks';

type TracksStatsProps = {
  stats: TracksStat[];
};

export function TracksStats({ stats }: TracksStatsProps) {
  return <MetricStats stats={stats} />;
}
