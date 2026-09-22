import { Prisma } from '../../generated/prisma';
import { LISTED_REGISTRATION_STATUSES } from '../registrations/registration-status';
import { rankRegistrations } from './rank-registrations';

export async function freezeEventPlaces(
  db: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      laps: { select: { id: true } },
      registrations: {
        where: { status: { in: [...LISTED_REGISTRATION_STATUSES] } },
        select: {
          id: true,
          formatId: true,
          gender: true,
          startNumber: true,
          status: true,
          registeredAt: true,
          result: {
            select: {
              id: true,
              timeMilliseconds: true,
              laps: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!event) return;

  const brackets = await db.classCompetition.findMany({
    where: { eventId },
    select: { formatId: true, gender: true },
  });
  const bracketKeys = new Set(
    brackets.map((row) => `${row.formatId ?? 'none'}:${row.gender}`),
  );

  const ranked = rankRegistrations(event.registrations, event.laps.length);
  for (const { registration, place } of ranked) {
    if (bracketKeys.has(`${registration.formatId ?? 'none'}:${registration.gender}`)) {
      continue;
    }
    if (!registration.result) continue;
    await db.result.update({
      where: { id: registration.result.id },
      data: { place },
    });
  }
}
