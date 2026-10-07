import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// A real, loopback-only PostgreSQL cluster for development. Never reuse these
// settings for a hosted database or replace an existing environment file.
const root = path.resolve(import.meta.dirname, '..');
const local = path.join(root, '.local');
const envPath = path.join(root, '.env');
const marker = '# Auvresence local development database';
if (existsSync(envPath) && !readFileSync(envPath, 'utf8').startsWith(marker)) {
  throw new Error('An existing .env is configured. Use that database, or preserve and move the file before choosing db:local.');
}
mkdirSync(local, { recursive: true, mode: 0o700 });
const settingsPath = path.join(local, 'database.json');
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : { user: 'auvresence', password: randomBytes(24).toString('hex'), port: 5432 };
if (!existsSync(settingsPath)) writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o600 });
if (!existsSync(envPath)) writeFileSync(envPath, `${marker}\nDATABASE_URL=postgresql://${settings.user}:${settings.password}@127.0.0.1:${settings.port}/auvresence\nSQL_HOST=127.0.0.1\nSQL_DB_NAME=auvresence\nSQL_USER=${settings.user}\nSQL_PASSWORD=${settings.password}\nSQL_ADMIN_USER=${settings.user}\nSQL_ADMIN_PASSWORD=${settings.password}\nSHOWCASE_MODE=true\n`, { mode: 0o600 });
const pg = new EmbeddedPostgres({ databaseDir: path.join(local, 'postgres'), ...settings, persistent: true, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: console.error });
if (!existsSync(path.join(local, 'postgres', 'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'auvresence'");
await client.end();
if (!rows.length) await pg.createDatabase('auvresence');
console.log('Local PostgreSQL ready. Run npm run db:push, then npm run dev in another terminal.');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await pg.stop(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
