import { DomainError, ErrorCodes } from '../errors';
import { Heat, ManualHeatAssignment, Participant } from '../types';

export function assignManualHeats(
  participants: Participant[],
  manualHeats: ManualHeatAssignment[] | undefined,
  expectedHeatCount?: number,
  options?: { allowEmpty?: boolean },
): Heat[] {
  if (!manualHeats || manualHeats.length === 0) {
    throw new DomainError(
      ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
      'MANUAL seeding requires manualHeats.',
      'manualHeats',
    );
  }

  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const assigned = new Set<string>();
  const heatNumbers = manualHeats.map((heat) => heat.heatNumber);
  const uniqueNumbers = new Set(heatNumbers);

  if (uniqueNumbers.size !== manualHeats.length) {
    throw new DomainError(
      ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
      'manualHeats must not contain duplicate heatNumber values.',
      'manualHeats',
    );
  }

  const sorted = [...manualHeats].sort((a, b) => a.heatNumber - b.heatNumber);
  for (let index = 0; index < sorted.length; index += 1) {
    const expected = index + 1;
    if (sorted[index].heatNumber !== expected) {
      throw new DomainError(
        ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
        'manualHeats heatNumber values must be consecutive starting at 1.',
        `manualHeats[${index}].heatNumber`,
      );
    }
  }

  if (expectedHeatCount != null && sorted.length !== expectedHeatCount) {
    throw new DomainError(
      ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
      `Expected ${expectedHeatCount} heats, received ${sorted.length}.`,
      'manualHeats',
    );
  }

  const heats: Heat[] = [];
  for (let heatIndex = 0; heatIndex < sorted.length; heatIndex += 1) {
    const assignment = sorted[heatIndex];
    if (!options?.allowEmpty && !assignment.participantIds.length) {
      throw new DomainError(
        ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
        'Each manual heat must contain at least one participant.',
        `manualHeats[${heatIndex}].participantIds`,
      );
    }
    const slots = assignment.participantIds.map((id, position) => {
      const participant = byId.get(id);
      if (!participant) {
        throw new DomainError(
          ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
          `Unknown participant id "${id}" in manual heat ${assignment.heatNumber}.`,
          `manualHeats[${heatIndex}].participantIds[${position}]`,
        );
      }
      if (assigned.has(id)) {
        throw new DomainError(
          ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
          `Participant "${id}" is assigned to more than one heat.`,
          `manualHeats[${heatIndex}].participantIds[${position}]`,
        );
      }
      assigned.add(id);
      return { position: position + 1, participant };
    });
    heats.push({ heatNumber: assignment.heatNumber, slots });
  }

  if (assigned.size !== participants.length) {
    const missing = participants
      .filter((participant) => !assigned.has(participant.id))
      .map((participant) => participant.id);
    throw new DomainError(
      ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
      `manualHeats is missing participants: ${missing.join(', ')}.`,
      'manualHeats',
    );
  }

  return heats;
}
