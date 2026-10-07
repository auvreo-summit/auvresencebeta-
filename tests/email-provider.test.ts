import test from 'node:test';import assert from 'node:assert/strict';
import { emailProvider } from '../src/lib/email-provider.ts';
test('default automation provider reports unavailable without sending or inventing a delivery',async()=>{assert.deepEqual(await emailProvider.send({to:'fixture@example.test',subject:'Acceptance',text:'Test'}),{status:'unavailable'});});
