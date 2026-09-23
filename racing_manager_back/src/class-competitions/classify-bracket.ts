import { CmsCompetition } from './cms.types';

type StoredHeatTime = {
  stageId: string;
  heatNumber: number;
  registrationId: string;
  timeMilliseconds: number | null;
  status: string;
};

type ClassifiedRow = {
  participantId: string;
  stageKey: string;
  heatPlace: number | null;
};

export function classifyBracket(
  competition: CmsCompetition,
  timeByParticipant: Map<string, number> = new Map(),
): Map<string, number> {
  const byStage = new Map(competition.stages.map((stage) => [stage.stageId, stage]));
  const placed = new Map<string, number>();

  const assignOk = (stageId: string) => {
    const stage = byStage.get(stageId);
    if (!stage) return;
    const rows = stage.ranking
      .filter((row) => row.status === 'OK')
      .sort((a, b) => a.rank - b.rank)
      .map((row) => ({
        participantId: row.participantId,
        stageKey: stageId,
        heatPlace: row.place,
      }));
    takePlaces(rows, placed, timeByParticipant);
  };

  if (byStage.has('final_a')) assignOk('final_a');
  else assignOk('final');
  assignOk('final_b');

  const latest = new Map<
    string,
    { index: number; rank: number; place: number | null; stageId: string }
  >();
  competition.format.stages.forEach((stage, index) => {
    const run = byStage.get(stage.id);
    if (!run) return;
    for (const row of run.ranking) {
      latest.set(row.participantId, {
        index,
        rank: row.rank,
        place: row.place,
        stageId: stage.id,
      });
    }
  });

  const rest = [...latest.entries()]
    .filter(([id]) => !placed.has(id))
    .sort((a, b) => {
      if (a[1].index !== b[1].index) return b[1].index - a[1].index;
      return a[1].rank - b[1].rank;
    })
    .map(
      ([participantId, row]): ClassifiedRow => ({
        participantId,
        stageKey: row.stageId,
        heatPlace: row.place,
      }),
    );
  takePlaces(rest, placed, timeByParticipant);

  return placed;
}

function takePlaces(
  rows: ClassifiedRow[],
  placed: Map<string, number>,
  timeByParticipant: Map<string, number>,
) {
  const shared = new Map<string, number>();
  for (const row of rows) {
    if (placed.has(row.participantId)) continue;
    const time = timeByParticipant.get(row.participantId);
    const tieKey =
      time != null
        ? `${row.stageKey}:t:${time}`
        : row.heatPlace != null
          ? `${row.stageKey}:p:${row.heatPlace}`
          : null;
    const known = tieKey != null ? shared.get(tieKey) : undefined;
    if (known != null) {
      placed.set(row.participantId, known);
      continue;
    }
    const place = placed.size + 1;
    placed.set(row.participantId, place);
    if (tieKey != null) shared.set(tieKey, place);
  }
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
