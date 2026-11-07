import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import {
  createPrismaCutoverStore,
  runMultiStartCutover,
} from './multi-start-cutover';

const DEFAULT_REPORT_PATH = 'multi-start-anomalies.json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf('--report');
  const reportPath =
    reportIndex >= 0 ? args[reportIndex + 1] : DEFAULT_REPORT_PATH;
  if (!reportPath) {
    throw new Error('--report requires a file path.');
  }
  const eventIds = args.filter(
    (arg, index) => index !== reportIndex && index !== reportIndex + 1,
  );

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const summary = await runMultiStartCutover(
      createPrismaCutoverStore(prisma),
      eventIds.length > 0 ? { eventIds } : {},
    );

    writeFileSync(
      reportPath,
      `${JSON.stringify({ events: summary.events, anomalies: summary.anomalies }, null, 2)}\n`,
      'utf8',
    );

    const blocked = summary.events.filter(
      (event) => event.status === 'blocked',
    );
    console.log(
      `multi-start cutover: ${summary.events.length} event(s), ${summary.events.length - blocked.length} migrated, ${blocked.length} blocked, ${summary.anomalies.length} anomaly row(s).`,
    );
    console.log(`anomaly report: ${reportPath}`);

    for (const event of blocked) {
      console.error(
        `blocked ${event.eventId}: ${event.blockedReasonCode ?? 'UNKNOWN'} - ${event.blockedReason ?? ''}`,
      );
    }
    if (blocked.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
