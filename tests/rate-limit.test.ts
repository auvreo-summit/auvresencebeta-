import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/middleware/rate-limit.ts';
test('AI limiter rejects bursts, ignores forwarded identity and resets after its window',()=>{
 let time=0;const limiter=createRateLimiter(2,1000,()=>time);let passed=0,status=200,body:any,wait:string|undefined;
 const req:any={ip:'127.0.0.1',headers:{'x-forwarded-for':'attacker-changeable'},socket:{remoteAddress:'127.0.0.1'}};
 const res:any={setHeader:(_key:string,value:string)=>{wait=value;},status:(value:number)=>{status=value;return res;},json:(value:any)=>{body=value;}};
 const next=()=>{passed++;};limiter(req,res,next);limiter(req,res,next);limiter(req,res,next);
 assert.equal(passed,2);assert.equal(status,429);assert.equal(body.code,'AI_RATE_LIMITED');assert.equal(wait,'1');
 time=1001;limiter(req,res,next);assert.equal(passed,3);
});
