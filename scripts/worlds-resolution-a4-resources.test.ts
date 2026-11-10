/** No database or environment file: test actual V8 admission and slot recovery. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {withTerrainResourceBudget} from "../src/features/worlds/terrain-resource-budget";
async function main(){
 if(process.argv.includes("--low-memory")){let reached=false;await assert.rejects(withTerrainResourceBudget(4096*4096,async()=>{reached=true;}),e=>!!e&&typeof e==="object"&&"status"in e&&e.status===503);assert.equal(reached,false);console.log(JSON.stringify({lowHeadroomRefusedBeforeAllocation:true}));return;}
 let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;}),hold=new Promise<void>(resolve=>{release=resolve;});
 const first=withTerrainResourceBudget(2048*2048,async()=>{assert.equal(await withTerrainResourceBudget(2048*2048,async()=>"nested"),"nested");entered();await hold;});await ready;
 try{await assert.rejects(withTerrainResourceBudget(2048*2048,async()=>"unreachable"),e=>!!e&&typeof e==="object"&&"status"in e&&e.status===429);}finally{release();await first;}
 assert.equal(await withTerrainResourceBudget(2048*2048,async()=>"recovered"),"recovered");
 await assert.rejects(withTerrainResourceBudget(2048*2048,async()=>{throw Error("A4 injected acceptance failure");}),/injected acceptance failure/);
 assert.equal(await withTerrainResourceBudget(2048*2048,async()=>"recovered after failure"),"recovered after failure");
 const low=execFileSync(process.execPath,["--max-old-space-size=128","--conditions=react-server","--import","tsx","scripts/worlds-resolution-a4-resources.test.ts","--low-memory"],{windowsHide:true,encoding:"utf8",timeout:30000});assert(JSON.parse(low).lowHeadroomRefusedBeforeAllocation);console.log(JSON.stringify({passed:true,concurrentLargeAcceptanceRefused:true,nestedWriterSharesSlot:true,slotReleasedAfterCompletionAndFailure:true,lowHeap128MiBRefuses4096BeforeAllocation:true,noDatabaseOrOwnerEnvironment:true}));
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
