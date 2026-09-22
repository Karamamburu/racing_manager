import { CmsCompetition } from './cms.types';

type StoredHeatTime = {
  stageId: string;
  heatNumber: number;
  registrationId: string;
  timeMilliseconds: number | null;
  status: string;
};

export function classifyBracket(competition: CmsCompetition): Map<string, number> {
  const byStage = new Map(competition.stages.map((stage) => [stage.stageId, stage]));
  const placed = new Map<string, number>();
  let place = 0;

  const assignOk = (stageId: string) => {
    const stage = byStage.get(stageId);
    if (!stage) return;
    const rows = stage.ranking
      .filter((row) => row.status === 'OK')
      .sort((a, b) => a.rank - b.rank);
    for (const row of rows) {
      if (placed.has(row.participantId)) continue;
      place += 1;
      placed.set(row.participantId, place);
    }
  };

  if (byStage.has('final_a')) assignOk('final_a');
  else assignOk('final');
  assignOk('final_b');

  const latest = new Map<string, { index: number; rank: number }>();
  competition.format.stages.forEach((stage, index) => {
    const run = byStage.get(stage.id);
    if (!run) return;
    for (const row of run.ranking) {
      latest.set(row.participantId, { index, rank: row.rank });
    }
  });

  const rest = [...latest.entries()]
    .filter(([id]) => !placed.has(id))
    .sort((a, b) => {
      if (a[1].index !== b[1].index) return b[1].index - a[1].index;
      return a[1].rank - b[1].rank;
    });
  for (const [id] of rest) {
    place += 1;
    placed.set(id, place);
  }

  return placed;
}

export function lastOkTimes(
  competition: CmsCompetition,
  heatTimes: StoredHeatTime[],
): Map<string, number> {
  const times = new Map<string, number>();
  for (const row of heatTimes) {
    if (row.status !== 'OK' || row.timeMilliseconds == null) continue;
    times.set(`${row.stageId}:${row.heatNumber}:${row.registrationId}`, row.timeMilliseconds);
  }

  const byStage = new Map(competition.stages.map((stage) => [stage.stageId, stage]));
  const pending = new Set(competition.participants.map((participant) => participant.id));
  const found = new Map<string, number>();
  const order = competition.format.stages.map((stage) => stage.id).reverse();
  for (const stageId of order) {
    const stage = byStage.get(stageId);
    if (!stage) continue;
    for (const heat of stage.heats) {
      for (const slot of heat.slots) {
        if (!pending.has(slot.participantId) || slot.result?.status !== 'OK') continue;
        const time = times.get(`${stageId}:${heat.heatNumber}:${slot.participantId}`);
        if (time == null) continue;
        found.set(slot.participantId, time);
        pending.delete(slot.participantId);
      }
    }
  }
  return found;
}
