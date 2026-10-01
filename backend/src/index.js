import { createApp } from './app.js';
import { assertConfig, config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

try {
  assertConfig();
  await connectDb(config.mongoUri);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const server = createApp().listen(config.port, () => {
  console.log(`Product Lab API listening on http://localhost:${config.port}`);
});

if (config.scheduler) startScheduler();

async function shutdown() {
  stopScheduler();
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
