import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger/logger.js';
import { checkDatabaseConnection, closeDatabase } from './infrastructure/database/db.js';
import { ensureUploadRoot } from './infrastructure/storage/localFileStorage.js';
import { closePdfBrowser } from './infrastructure/documents/pdfBrowser.js';

logger.info({ port: env.PORT, origin: env.APP_ORIGIN }, 'Starting Fire Safety API server...');

try {
  await ensureUploadRoot();
  await checkDatabaseConnection();
} catch (error) {
  logger.fatal({ err: error }, 'Fire Safety API failed during startup checks');
  process.exit(1);
}

const server = createServer(createApp());

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(
      { port: env.PORT },
      `Port ${env.PORT} is already in use by another process. Please terminate the process on port ${env.PORT} or configure a different PORT in server/.env.`,
    );
  } else if (err.code === 'EACCES') {
    logger.fatal(
      { port: env.PORT },
      `Permission denied to bind to port ${env.PORT}. Check if Windows has reserved this port range or change PORT in server/.env.`,
    );
  } else {
    logger.fatal({ err }, 'Fire Safety API server encountered an error');
  }
  process.exit(1);
});

server.listen(env.PORT, '0.0.0.0', () => {
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

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception in Fire Safety API');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

