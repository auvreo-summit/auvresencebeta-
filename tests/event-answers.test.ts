import test from 'node:test';import assert from 'node:assert/strict';
import { answerEventQuestion } from '../src/lib/event-answers.ts';
import type { AuthorisedParticipantAIContext } from '../src/lib/ai-provider.ts';
const context: AuthorisedParticipantAIContext = { participantName:'Guest', participantRole:'Participant', applicationStatus:'ACCEPTED', credentialCode:null, credentialStatus:null, eventTitle:'BANANA FESTIVAL', eventDates:'December', eventLocation:'Garden',happeningNow:null,upNext:null,schedule:[],announcements:[],resources:[],waypointTrail:[],venueDirectory:[] };
test('next answers work without an AI provider or invented schedule',()=>assert.match(answerEventQuestion("What's next?",context)!,/Nothing is scheduled next/));
test('an unassigned venue never becomes a made-up location or null string',()=>{const c={...context,upNext:{title:'Welcome',startTime:'10:00',endTime:'11:00',venueName:null,venueFloor:null,venueZone:null,lastUpdatedNote:null}};assert.match(answerEventQuestion("What's next?",c)!,/Location to be announced/);assert.doesNotMatch(answerEventQuestion("What's next?",c)!,/null/);});
test('missing amenities are reported honestly',()=>assert.match(answerEventQuestion('Where is food?',context)!,/hasn’t mapped/));
test('closed amenities retain their actual availability',()=>{const c={...context,venueDirectory:[{name:'Fruit stand',floor:'Garden',zone:'East',poiType:'FOOD',poiCategory:'AMENITY',operationalStatus:'CLOSED',accessible:true}]};assert.match(answerEventQuestion('Where is food?',c)!,/Currently unavailable/);});
test('ambiguous planning is left to the configured AI provider',()=>assert.equal(answerEventQuestion('Help me plan a welcoming experience',context),null));
