import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
if (!process.env.DATABASE_URL || !['127.0.0.1','localhost'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Use a loopback test PostgreSQL database.');
const base='http://127.0.0.1:3003';
const env={...process.env,PORT:'3003',NODE_ENV:'production',SHOWCASE_MODE:'true',ENABLE_DEMO_IDENTITIES:'true',SHOWCASE_DEBUG:'false'};
let child;let checks=0;
async function request(path,token,method='GET',body,status=200) { const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.equal(response.status,status,result.error);checks++;return result; }
async function start() {
 child=spawn(process.execPath,['--import','tsx','server.ts'],{env,stdio:['ignore','ignore','ignore']});
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Restart test server exited early.');try{const response=await fetch(base+'/api/health');if(response.status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 throw new Error('Restart test server did not become ready.');
}
async function stop() {if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
async function session(account){return (await request('/api/auth/demo-session',null,'POST',{account})).token;}
try {
 await start();let owner=await session('ORGANISER_B');let participant=await session('PARTICIPANT_A');
 const event=(await request('/api/events',owner,'POST',{title:'Restart persistence fixture',eventType:'Workshop',description:'Controlled local restart persistence regression.',startDate:'2026-12-20',endDate:'2026-12-20',timezone:'Asia/Kolkata',location:'Garden'},201)).event;
 const id=event.id;
 const app=(await request(`/api/events/${id}/apply`,participant,'POST',{applicantName:'Local fixture',institution:'Community',category:'Participant',statement:'I would like to attend this workshop.'},201)).application;
 const accepted=await request(`/api/organiser/applications/${app.id}/status`,owner,'PATCH',{status:'ACCEPTED'});
 const floor=(await request(`/api/organiser/events/${id}/floors`,owner,'POST',{name:'Ground',levelOrder:0},201)).floor;
 const place=(await request(`/api/organiser/events/${id}/venues`,owner,'POST',{floorId:floor.id,name:'Welcome desk',shortDescription:'Start your workshop visit here.',floor:floor.name,zone:'East',mapX:20,mapY:30},201)).venue;
 await request(`/api/organiser/events/${id}/sessions`,owner,'POST',{title:'Welcome',description:'A programme moment.',startTime:'10:00',endTime:'11:00',dayLabel:'Day 1',track:'General',venueId:place.id,status:'UP_NEXT'},201);
 await request(`/api/organiser/events/${id}/announcements`,owner,'POST',{title:'Welcome update',body:'Please check in at the welcome desk.',audience:'ACCEPTED_ONLY'},201);
 await request(`/api/organiser/events/${id}/config`,owner,'PATCH',{visibility:'PRIVATE',applicationStatus:'CLOSED'});
 const oldToken=owner;
 await stop();await start();owner=await session('ORGANISER_B');participant=await session('PARTICIPANT_A');
 await request('/api/me',oldToken,'GET',null,401);
 const context=await request(`/api/events/${id}/context`,participant);
 assert.equal(context.event.title,event.title);assert.equal(context.event.applicationStatus,'CLOSED');assert.equal(context.myApplication.status,'ACCEPTED');assert.equal(context.myCredential.id,accepted.credential.id);assert.equal(context.floors[0].id,floor.id);assert.equal(context.venues[0].id,place.id);assert.equal(context.pulse.upNext.title,'Welcome');assert.equal(context.announcements[0].title,'Welcome update');assert.equal(context.pulse.nextDestination.waypointToken,'');checks+=9;
 assert.ok((await request('/api/me/journeys',owner)).organising.some(e=>e.id===id));checks++;
 assert.equal((await request(`/api/verify/${accepted.credential.verificationToken}`)).valid,true);checks++;
 const health=await request('/api/health');assert.equal(health.debugToolsEnabled,false);checks++;
 console.log(`${checks} restart assertions passed: event, application, credential, settings, venue, programme and announcement survive a production server restart. Synthetic sessions are reissued; no Google session restoration claim.`);
} finally {await stop();}
