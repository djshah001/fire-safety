import { setTimeout as delay } from 'node:timers/promises';
import { logger } from './core/logger/logger.js';
import { checkDatabaseConnection, closeDatabase, pool } from './infrastructure/database/db.js';
import { createWorkerId, processOneOutboxJob } from './infrastructure/jobs/outboxWorker.js';

const workerId = createWorkerId();
const stopController = new AbortController();
let stopping = false;
let inFlightJob: Promise<boolean> | null = null;

async function sleepOrAbort(ms: number) {
  try {
    await delay(ms, undefined, { signal: stopController.signal });
  } catch (error) {
    if ((error as { name?: string })?.name !== 'AbortError') {
      throw error;
    }
  }
}

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
        await sleepOrAbort(idleDelay);
      } else {
        consecutiveIdle = 0;
      }
    } catch (error) {
      inFlightJob = null;
      consecutiveIdle = 0;
      logger.error({ err: error, workerId }, 'Worker polling failed');
      await sleepOrAbort(5_000);
    }
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  stopController.abort();
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

  await closeDatabase().catch((databaseError: unknown) => {
    logger.error({ err: databaseError, workerId }, 'Worker database pool shutdown failed');
  });
  logger.info({ workerId }, 'Worker shutdown complete');
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error, workerId }, 'Uncaught exception in Fire Safety worker');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason, workerId }, 'Unhandled promise rejection in Fire Safety worker');
});

run().catch(async (error: unknown) => {
  logger.fatal({ err: error, workerId }, 'Worker failed to start');
  process.exitCode = 1;
  await closeDatabase();
});

