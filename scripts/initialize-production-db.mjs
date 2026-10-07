import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';

// One-time bootstrap for a newly provisioned empty production database.
// Existing databases must use a separately reviewed migration, never this path.
if (process.env.AUVRESENCE_INITIALIZE_EMPTY_DATABASE !== 'true') process.exit(0);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for schema initialization.');

const exported = spawnSync(process.execPath, [
  'node_modules/drizzle-kit/bin.cjs', 'export', '--dialect', 'postgresql',
  '--schema', './src/db/schema.ts',
], { encoding: 'utf8' });
const sql = exported.stdout || '';
if (exported.status !== 0 || !sql.startsWith('CREATE TABLE') || /^(?:DROP|TRUNCATE|DELETE|UPDATE)\s/im.test(sql)) {
  throw new Error('Schema export did not produce a safe initial schema; refusing initialization.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('auvresence-initial-schema'))");
  const existing = await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  if (existing.rows[0].count !== 0) throw new Error('Production database is not empty; refusing initial schema writes.');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Initial production schema created transactionally in the configured DATABASE_URL.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  // Never print connection details or query parameters to deployment logs.
  console.error('Production schema initialization failed.', { code: error.code || 'INITIALIZATION_REFUSED' });
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
