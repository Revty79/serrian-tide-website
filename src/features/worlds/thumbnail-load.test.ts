import assert from "node:assert/strict";
import {test} from "node:test";
import {scheduleThumbnail} from "./thumbnail-load";
test("lazy preview queue bounds active jobs, drops cancelled waiting contexts and drains after failures",async()=>{
 let running=0,max=0;const release:(()=>void)[]=[],controllers=Array.from({length:5},()=>new AbortController());
 const jobs=controllers.map((c,i)=>scheduleThumbnail(async()=>{running++;max=Math.max(max,running);await new Promise<void>(r=>release.push(r));running--;if(i===1)throw new Error("fixture failure");return i;},c.signal));
 const settled=Promise.allSettled(jobs);controllers[3].abort();assert.equal(release.length,2);release.shift()!();release.shift()!();await new Promise(r=>setTimeout(r,0));assert.equal(release.length,2);release.shift()!();release.shift()!();const results=await settled;
 assert.equal(max,2);assert.equal(results[0].status,"fulfilled");assert.equal(results[1].status,"rejected");assert.equal(results[3].status,"rejected");assert.equal(results[4].status,"fulfilled");
});
