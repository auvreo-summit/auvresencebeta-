import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Exercise the actual exported backend against the configured local database.
// This is not a deployed Vercel or Google-authenticated golden-path test.
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.ENABLE_DEMO_IDENTITIES = 'false';
process.env.SHOWCASE_DEBUG = 'false';
const { default: handler } = await import('../api/index.ts');
const { createPool } = await import('../src/db/index.ts');
const server = createServer(handler);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  let response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.databaseReady, true);
  assert.equal(health.schemaReady, true);
  assert.equal(health.demoIdentitiesEnabled, false);
  assert.equal(health.debugToolsEnabled, false);
  response = await fetch(`${base}/api/me`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTHENTICATION_FAILED');
  response = await fetch(`${base}/api/events`);
  assert.equal(response.status, 200);
  await response.json();
  response = await fetch(`${base}/api/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 401);
  await response.json();
  response = await fetch(`${base}/api/nonexistent-route`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'NOT_FOUND');
  console.log('11 Vercel handler assertions passed against real local PostgreSQL; no authentication bypass or database writes.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await createPool().end();
}
