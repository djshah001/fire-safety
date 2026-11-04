import { setTimeout as delay } from 'node:timers/promises';
import { logger } from './core/logger/logger.js';
import { checkDatabaseConnection, closeDatabase, pool } from './infrastructure/database/db.js';
import { createWorkerId, processOneOutboxJob } from './infrastructure/jobs/outboxWorker.js';

const workerId = createWorkerId();
let stopping = false;
let inFlightJob: Promise<boolean> | null = null;

async function run() {
  await checkDatabaseConnection();
  logger.info({ workerId }, 'Fire Safety worker started');
  let consecutiveIdle = 0;

  while (!stopping) {
    try {
      inFlightJob = processOneOutboxJob(pool, workerId);
      const processed = await inFlightJob;
      inFlightJob = null;

      if (!processed) {
        consecutiveIdle++;
        // Adaptive idle backoff: 1s -> 2s -> 3s -> 4s -> max 5s to reduce idle DB load
        const idleDelay = Math.min(5_000, 1_000 + consecutiveIdle * 1_000);
        await delay(idleDelay);
      } else {
        consecutiveIdle = 0;
      }
    } catch (error) {
      inFlightJob = null;
      consecutiveIdle = 0;
      logger.error({ err: error, workerId }, 'Worker polling failed');
      await delay(5_000);
    }
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal, workerId }, 'Worker shutdown requested');

  // If a job is currently executing, wait for it to finish cleanly before closing database
  if (inFlightJob) {
    logger.info({ workerId }, 'Waiting for in-flight job to finish...');
    try {
      await Promise.race([
        inFlightJob,
        delay(10_000), // Max 10-second grace window to drain in-flight job
      ]);
    } catch {
      // In-flight error is handled and logged inside processOneOutboxJob
    }
  }

  await closeDatabase();
  logger.info({ workerId }, 'Worker shutdown complete');
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

run().catch(async (error: unknown) => {
  logger.fatal({ err: error, workerId }, 'Worker failed to start');
  process.exitCode = 1;
  await closeDatabase();
});

