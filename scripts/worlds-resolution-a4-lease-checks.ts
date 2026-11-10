import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {WORLD_LEASE_SECONDS,type WorldEditorProof} from "../src/features/worlds/world-permissions";

/** A native transaction can hold the World row for minutes. Its legitimate
 * heartbeat must complete without that row, while all proof checks still apply. */
export async function resolutionLeaseChecks(f:RegionalFixture,worldId:string){
 const actor="world-god",sessionId=randomUUID(),proof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")};
 await f.pool.query('insert into session(id,token,user_id,expires_at,updated_at) values($1,$2,$3,(clock_timestamp() at time zone \'UTC\')+interval \'1 hour\',now())',[sessionId,randomUUID(),actor]);
 const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),collaboration=await import("../src/features/worlds/world-collaboration-service");
 const run=<T>(body:()=>Promise<T>)=>withWorldRequestAuthority({userId:actor,sessionId,proof,review:false,operationId:randomUUID(),reads:new Map()},body);
 const acquired=await run(()=>collaboration.changeWorldCollaboration(actor,worldId,{action:"acquire-control",requestId:randomUUID(),proof}));proof.fence=acquired.access.editor.fence!;
 const locker=await f.pool.connect();await locker.query("begin");await locker.query("select id from world where id=$1 for update",[worldId]);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{const renewed=await Promise.race([run(()=>collaboration.changeWorldCollaboration(actor,worldId,{action:"renew-control",requestId:randomUUID(),proof})),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Renewal blocked behind World row")),5000);})]);assert(renewed.access.editor.yours);}
 finally{if(timer)clearTimeout(timer);await locker.query("rollback");locker.release();}
 const deadline=(await f.pool.query("select extract(epoch from(expires_at-clock_timestamp())) seconds from world_editor_lease where world_id=$1",[worldId])).rows[0];assert(Number(deadline.seconds)>WORLD_LEASE_SECONDS-10);assert(Number(deadline.seconds)<=WORLD_LEASE_SECONDS);
 const denied=(error:unknown)=>!!error&&typeof error==="object"&&"status"in error&&[401,409].includes(Number(error.status));
 for(const invalid of [{...proof,token:"e".repeat(64)},{...proof,fence:proof.fence!+1},{...proof,clientId:randomUUID()}])await assert.rejects(run(()=>collaboration.changeWorldCollaboration(actor,worldId,{action:"renew-control",requestId:randomUUID(),proof:invalid})),denied);
 await f.pool.query("update world_editor_lease set expires_at=clock_timestamp()-interval '1 second' where world_id=$1",[worldId]);
 await assert.rejects(run(()=>collaboration.changeWorldCollaboration(actor,worldId,{action:"renew-control",requestId:randomUUID(),proof})),denied);
 const again=await run(()=>collaboration.changeWorldCollaboration(actor,worldId,{action:"acquire-control",requestId:randomUUID(),proof}));proof.fence=again.access.editor.fence!;
 await f.pool.query("update session set expires_at=(clock_timestamp() at time zone 'UTC')-interval '1 second' where id=$1",[sessionId]);
 await assert.rejects(run(()=>collaboration.changeWorldCollaboration(actor,worldId,{action:"renew-control",requestId:randomUUID(),proof})),denied);
 return{renewalWhileWorldLocked:true,deadlineSeconds:WORLD_LEASE_SECONDS,wrongTokenFenceTabExpiredLeaseAndExpiredSessionRejected:true};
}
