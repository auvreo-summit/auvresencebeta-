import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseFailure, ProfileStorageError } from '../src/db/errors.ts';
test('missing-column errors retain diagnosis through Drizzle/profile wrapping', () => { const e=new ProfileStorageError(new Error('wrapper',{cause:{code:'42703',message:'sensitive SQL'}}));const result=databaseFailure(e);assert.equal(result?.code,'DATABASE_SCHEMA_OUTDATED');assert.equal(result?.status,503);assert.doesNotMatch(JSON.stringify(result),/sensitive SQL/); });
test('connection refusals are operational failures rather than invalid identity',()=>assert.equal(databaseFailure(new Error('wrapper',{cause:{code:'ECONNREFUSED'}}))?.code,'DATABASE_UNAVAILABLE'));
test('unclassified errors do not receive a fabricated database diagnosis',()=>assert.equal(databaseFailure(new Error('unknown')),null));
