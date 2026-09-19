import { DomainError, ErrorCodes } from './errors';
import { Participant } from './types';

export function normalizeParticipants(
  participants: Participant[],
  path = 'participants',
): Participant[] {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new DomainError(
      ErrorCodes.PARTICIPANT_INVALID,
      'At least one participant is required.',
      path,
    );
  }

  const ids = new Set<string>();
  const seeds = new Set<number>();

  for (let index = 0; index < participants.length; index += 1) {
    const participant = participants[index];
    const itemPath = `${path}[${index}]`;
    if (!participant.id || typeof participant.id !== 'string') {
      throw new DomainError(
        ErrorCodes.PARTICIPANT_INVALID,
        'Participant id must be a non-empty string.',
        `${itemPath}.id`,
      );
    }
    if (ids.has(participant.id)) {
      throw new DomainError(
        ErrorCodes.PARTICIPANT_INVALID,
        `Duplicate participant id "${participant.id}".`,
        `${itemPath}.id`,
      );
    }
    ids.add(participant.id);

    if (!Number.isInteger(participant.seed) || participant.seed < 1) {
      throw new DomainError(
        ErrorCodes.PARTICIPANT_INVALID,
        'Participant seed must be an integer >= 1.',
        `${itemPath}.seed`,
      );
    }
    if (seeds.has(participant.seed)) {
      throw new DomainError(
        ErrorCodes.PARTICIPANT_INVALID,
        `Duplicate participant seed ${participant.seed}.`,
        `${itemPath}.seed`,
      );
    }
    seeds.add(participant.seed);
  }

  return [...participants].sort((a, b) => a.seed - b.seed);
}

export function withSeeds(participants: Participant[]): Participant[] {
  return participants.map((participant, index) => ({
    ...participant,
    seed: index + 1,
  }));
}
