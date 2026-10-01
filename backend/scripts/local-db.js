import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = fileURLToPath(new URL('../.data/db', import.meta.url));
fs.mkdirSync(dbPath, { recursive: true });

const port = Number(process.env.LOCAL_DB_PORT ?? 27017);
const server = await MongoMemoryServer.create({ instance: { port, dbPath, storageEngine: 'wiredTiger' } });
console.log(`Local MongoDB running at ${server.getUri()}product-lab (data in backend/.data). Ctrl+C to stop.`);

async function stop() {
  await server.stop({ doCleanup: false });
  process.exit(0);
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
