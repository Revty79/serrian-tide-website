import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { withCollaborationFixture } from "./worlds-collaboration-fixture";
withCollaborationFixture(async f=>{
 const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),canon=await import("../src/features/worlds/world-canon-service");
 const asActor=<T>(userId:string,run:()=>T)=>withWorldRequestAuthority({userId,sessionId:f.sessions.get(userId)!,proof:null,review:false,operationId:randomUUID(),reads:new Map()},run);
 await f.pool.query(`create function test_canon_admin_revocation() returns trigger language plpgsql as $$ begin if NEW.action='world-canon' and NEW.after_state->>'note'='simulate admin role loss' then delete from user_role where user_id=NEW.actor_id; end if; return NEW; end $$; create trigger test_canon_admin_revocation after insert on world_access_audit for each row execute function test_canon_admin_revocation()`);
 await assert.rejects(asActor("collab-admin",()=>canon.changeWorldCanon("collab-admin",f.worldA,{requestId:randomUUID(),revision:0,isCanon:true,confirm:true,note:"simulate admin role loss"})),(error:unknown)=>!!error&&typeof error==="object"&&"status"in error&&error.status===403);
 assert.equal((await f.pool.query("select count(*)::int n from world_access_audit where action='world-canon'")).rows[0].n,0);assert.equal((await f.pool.query("select count(*)::int n from user_role where user_id='collab-admin' and role='admin'")).rows[0].n,1);
 await asActor("collab-admin",()=>canon.changeWorldCanon("collab-admin",f.worldA,{requestId:randomUUID(),revision:0,isCanon:true,confirm:true,note:"Reviewed fixture publication"}));
 await f.pool.query(`create function test_canon_player_revocation() returns trigger language plpgsql as $$ begin if NEW.name='simulate Player role loss' then delete from user_role where user_id=NEW.owner_id; end if; return NEW; end $$; create trigger test_canon_player_revocation after insert on world for each row execute function test_canon_player_revocation()`);
 const requestId=randomUUID();await assert.rejects(asActor("collab-player",()=>canon.createPersonalCanonWorld("collab-player",f.worldA,{requestId,revision:1,name:"simulate Player role loss"})),(error:unknown)=>!!error&&typeof error==="object"&&"status"in error&&error.status===403);
 assert.equal((await f.pool.query("select count(*)::int n from world where name='simulate Player role loss'")).rows[0].n,0);assert.equal((await f.pool.query("select count(*)::int n from world_access_audit where request_id=$1",[requestId])).rows[0].n,0);assert.equal((await f.pool.query("select count(*)::int n from user_role where user_id='collab-player' and role='player'")).rows[0].n,1);
 await writeFile(path.join(f.out,"canon-transactions.json"),JSON.stringify({passed:true,groups:["Administrator role loss during a canon decision rolls back decision and fence mutation","Player role loss during personal snapshot construction rolls back the new World, history and request receipts"],ownedTriggersOnly:true,sharedAccess:false},null,2));console.log("PASS canon transaction role rechecks");
}).catch(error=>{console.error(error instanceof Error?error.stack:error);process.exitCode=1;});
