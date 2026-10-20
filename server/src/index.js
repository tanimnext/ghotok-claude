import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';

await connectDb();
const server = createApp().listen(env.PORT, () => {
  logger.info(`Ghotok API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
