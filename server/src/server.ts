import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger/logger.js';
import { closeDatabase } from './infrastructure/database/db.js';
import { ensureUploadRoot } from './infrastructure/storage/localFileStorage.js';
import { closePdfBrowser } from './infrastructure/documents/pdfBrowser.js';

await ensureUploadRoot();

const server = createServer(createApp());

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, origin: env.APP_ORIGIN }, 'Fire Safety API listening');
});

let closing = false;

async function shutdown(signal: NodeJS.Signals) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'Graceful shutdown started');

  server.close(async (error) => {
    if (error) logger.error({ err: error }, 'HTTP server shutdown failed');
    await closePdfBrowser();
    await closeDatabase().catch((databaseError: unknown) => {
      logger.error({ err: databaseError }, 'Database pool shutdown failed');
    });
    process.exit(error ? 1 : 0);
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    const forceExit = setTimeout(() => process.exit(1), 1_000);
    void closePdfBrowser().finally(() => { clearTimeout(forceExit); process.exit(1); });
  }, 10_000).unref();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
