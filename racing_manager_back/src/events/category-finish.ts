import { Prisma, PrismaClient } from '../../generated/prisma';

export const CATEGORY_FINISHED_MESSAGE =
  'Гонка в этой категории завершена. Результаты менять нельзя.';

type FinishDb = Prisma.TransactionClient | PrismaClient;

export async function categoryIsFinished(
  db: FinishDb,
  eventId: string,
  formatId: number | null,
  gender: string,
  startId?: string | null,
): Promise<boolean> {
  if (gender !== 'M' && gender !== 'F') return false;
  const row = await db.categoryFinish.findFirst({
    where: {
      eventId,
      formatId,
      gender,
      ...(startId === undefined ? {} : { startId }),
    },
    select: { id: true },
  });
  return row != null;
}
