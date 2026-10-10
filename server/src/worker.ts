import { setTimeout as delay } from 'node:timers/promises';
import { logger } from './core/logger/logger.js';
import { checkDatabaseConnection, closeDatabase, pool } from './infrastructure/database/db.js';
import { createWorkerId, processOneOutboxJob } from './infrastructure/jobs/outboxWorker.js';

const workerId = createWorkerId();
let stopping = false;

async function run() {
  await checkDatabaseConnection();
  logger.info({ workerId }, 'Fire Safety worker started');
  while (!stopping) {
    try {
      const processed = await processOneOutboxJob(pool, workerId);
      if (!processed) await delay(1_000);
    } catch (error) {
      logger.error({ err: error, workerId }, 'Worker polling failed');
      await delay(5_000);
    }
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal, workerId }, 'Worker shutdown requested');
  await closeDatabase();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

run().catch(async (error: unknown) => {
  logger.fatal({ err: error, workerId }, 'Worker failed to start');
  process.exitCode = 1;
  await closeDatabase();
});
