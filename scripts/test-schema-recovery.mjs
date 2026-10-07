import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Pool } from 'pg';
const uri = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1','localhost'].includes(uri.hostname)) throw new Error('Use a local test database.');
const admin = new Pool({connectionString:uri.toString()});
const name='auv_schema_test_'+crypto.randomBytes(6).toString('hex');
await admin.query(`CREATE DATABASE ${name}`);
uri.pathname='/'+name;
const env={...process.env,DATABASE_URL:uri.toString(),NODE_ENV:'production',PORT:'3001',SHOWCASE_MODE:'true'};
let worker;const target=new Pool({connectionString:uri.toString()});
const base='http://127.0.0.1:3001';
async function runMigration(){const child=spawn(process.execPath,['node_modules/drizzle-kit/bin.cjs','push','--config','src/db/drizzle.config.ts','--force'],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const [code]=await once(child,'exit');if(code!==0)throw new Error('Migration failed: '+output);}
try {
 await runMigration();
 worker=spawn(process.execPath,['--import','tsx','server.ts'],{env,stdio:['ignore','ignore','ignore']});
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');if(r.status===200)break;}catch{}if(i===99)throw new Error('Test server did not become ready');await new Promise(r=>setTimeout(r,100));}
 const sr=await fetch(base+'/api/auth/demo-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'ORGANISER_B'})});assert.equal(sr.status,200);const {token}=await sr.json();
 await target.query('ALTER TABLE events DROP COLUMN event_type');
 const h=await fetch(base+'/api/health');assert.equal(h.status,503);assert.equal((await h.json()).database,'needs-schema-update');
 const payload={title:'Schema recovery event',eventType:'Festival',description:'A controlled schema recovery regression fixture.',startDate:'2026-12-20',endDate:'2026-12-20',timezone:'Asia/Kolkata',location:'Garden'};
 const create=()=>fetch(base+'/api/events',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const failed=await create();assert.equal(failed.status,503);assert.equal((await failed.json()).code,'DATABASE_SCHEMA_OUTDATED');
 await runMigration();
 const recovered=await create();assert.equal(recovered.status,201);const {event}=await recovered.json();const persisted=await target.query('select title from events where id=$1',[event.id]);assert.equal(persisted.rows[0].title,payload.title);
 console.log('Real POST /api/events failure reproduced with an outdated schema: 503 DATABASE_SCHEMA_OUTDATED. Migration through DATABASE_URL repaired it; 201 creation and PostgreSQL persistence verified. Google login is not exercised by this isolated showcase-authenticated test.');
} finally {
 if(worker && worker.exitCode===null){worker.kill('SIGTERM');await once(worker,'exit');}
 await target.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();
}
