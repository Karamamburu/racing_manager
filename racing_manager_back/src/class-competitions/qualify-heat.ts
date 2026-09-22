export type QualificationStatus = 'QQ' | 'NQ' | 'DNS' | 'DNF' | 'DSQ';

export type QualificationSlot = {
  registrationId: string;
  status: string;
  timeMilliseconds: number | null;
  startNumber: number | null;
};

export function qualificationForHeat(slots: QualificationSlot[]): Map<string, QualificationStatus> {
  const assigned = new Map<string, QualificationStatus>();
  const finished = slots
    .filter((slot) => slot.status === 'OK' && slot.timeMilliseconds != null)
    .sort((a, b) => {
      const byTime = (a.timeMilliseconds ?? 0) - (b.timeMilliseconds ?? 0);
      if (byTime !== 0) return byTime;
      return (
        (a.startNumber ?? Number.POSITIVE_INFINITY) - (b.startNumber ?? Number.POSITIVE_INFINITY)
      );
    });
  const qualifyCount = Math.ceil(finished.length / 2);
  finished.forEach((slot, index) => {
    assigned.set(slot.registrationId, index < qualifyCount ? 'QQ' : 'NQ');
  });
  for (const slot of slots) {
    if (assigned.has(slot.registrationId)) continue;
    if (slot.status === 'DNS' || slot.status === 'DNF' || slot.status === 'DSQ') {
      assigned.set(slot.registrationId, slot.status);
    }
  }
  return assigned;
}
