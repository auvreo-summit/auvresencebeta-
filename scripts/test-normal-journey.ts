import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPool } from '../src/db/index.ts';
import { getOrCreateUser, createEventByUser, getEventFullContext, isUserOrganiserForEvent, getUserJourneys, submitParticipantApplication, reviewApplicationByOrganiser, verifyPublicCredentialByToken } from '../src/db/queries.ts';
if (!['localhost','127.0.0.1'].includes(process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : process.env.SQL_HOST || '')) throw new Error('Use a local test database.');
const tag=crypto.randomUUID();
// Database-layer test fixtures only. This neither supplies nor bypasses tokens
// in the application, and does not claim to exercise interactive Google login.
const owner=await getOrCreateUser(`test-owner-${tag}`,`owner-${tag}@example.test`,'Normal Owner',false);
const guest=await getOrCreateUser(`test-guest-${tag}`,`guest-${tag}@example.test`,'Normal Guest',false);
assert.equal(owner.activeRole,'PARTICIPANT');assert.equal(owner.isDemoSeed,false);
const event=await createEventByUser({userId:owner.id,userEmail:owner.email,title:'Normal-account journey test',subtitle:'',eventType:'Festival',description:'A database regression fixture for normal account ownership.',organisationName:'Test collective',organisationHq:'Garden',location:'Garden',datesLabel:'20 December',startDate:'2026-12-20',endDate:'2026-12-20',timezone:'Asia/Kolkata',visibility:'PRIVATE'});
assert.equal(await isUserOrganiserForEvent(owner.id,event.id),true);
assert.equal(await isUserOrganiserForEvent(guest.id,event.id),false);
let c=await getEventFullContext(event.id,owner.id);assert.ok(c);assert.equal(c.isOrganiser,true);assert.equal(c.sessions.length,0);assert.equal(c.floors.length,0);assert.equal(c.venues.length,0);
assert.ok((await getUserJourneys(owner.id)).organising.some(e=>e.id===event.id));
// Keep the fixture public only while applying; applications cannot create
// membership in a private event without an existing relationship.
const pool=createPool();await pool.query('update events set visibility=$1 where id=$2',['PUBLIC',event.id]);
const app=await submitParticipantApplication({eventId:event.id,userId:guest.id,applicantName:guest.displayName,applicantEmail:guest.email,institution:'Community',category:'Participant',statement:'I would like to attend the community celebration.',isDemoUser:false});
const oldError=console.error;
try {
 console.error=()=>{}; // Expected audit constraint failure in this controlled test.
 await assert.rejects(reviewApplicationByOrganiser({applicationId:app.id,status:'ACCEPTED',reviewerUserId:owner.id,reviewerEmail:null as unknown as string}));
} finally { console.error=oldError; }
const before=await getEventFullContext(event.id,guest.id);assert.ok(before);assert.equal(before.myApplication?.status,'UNDER_REVIEW');assert.equal(before.myCredential,null);
const reviewed=await reviewApplicationByOrganiser({applicationId:app.id,status:'ACCEPTED',reviewerUserId:owner.id,reviewerEmail:owner.email});assert.ok(reviewed.credential);
c=await getEventFullContext(event.id,guest.id);assert.ok(c);assert.equal(c.myApplication?.status,'ACCEPTED');assert.ok(c.myCredential);assert.equal(c.isOrganiser,false);
assert.ok((await getUserJourneys(guest.id)).participating.some(j=>j.event.id===event.id));
const verified=await verifyPublicCredentialByToken(c.myCredential!.verificationToken);assert.equal(verified?.valid,true);
await pool.query('update events set visibility=$1 where id=$2',['PRIVATE',event.id]);
c=await getEventFullContext(event.id,guest.id);assert.ok(c);assert.equal(c.event.id,event.id);
console.log('20 normal-account database assertions passed: owner with participant default role creates/owns event; second identity applies, is accepted, receives credential and journey, and never gains organiser authority.');
await pool.end();
