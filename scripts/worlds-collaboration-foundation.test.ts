import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { withCollaborationFixture } from "./worlds-collaboration-fixture";
import type { WorldEditorProof } from "../src/features/worlds/world-permissions";

withCollaborationFixture(async f=>{
  const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),collab=await import("../src/features/worlds/world-collaboration-service"),service=await import("../src/features/worlds/world-service"),access=await import("../src/features/worlds/world-access-service"),history=await import("../src/features/worlds/history-index-service");
  const groups:string[]=[],owner="collab-owner-a",editor="collab-editor",viewer="collab-viewer",admin="collab-admin";
  const asActor=<T>(userId:string,proof:WorldEditorProof|null,run:()=>T,review=false)=>withWorldRequestAuthority({userId,sessionId:f.sessions.get(userId)!,proof,review,operationId:randomUUID(),reads:new Map()},run);
  const freshProof=():WorldEditorProof=>({clientId:randomUUID(),token:randomBytes(32).toString("hex")});
  const denied=(status:number)=>(error:unknown)=>!!error&&typeof error==="object"&&"status"in error&&error.status===status;
  const grantScopes=["overview","history","atlas"] as const;
  for(const userId of ["collab-owner-b","collab-uninvited","collab-player",viewer,editor])await assert.rejects(asActor(userId,null,()=>service.getWorld(userId,f.worldA)),denied(404));
  await assert.rejects(asActor("collab-player",null,()=>service.createWorld("collab-player",{})),denied(403));
  const ownList=await service.listWorlds("collab-owner-b");assert.deepEqual(ownList.map(row=>row.id),[f.worldB]);groups.push("private World isolation and creator eligibility");

  const viewerInvite={action:"invite",requestId:randomUUID(),username:"invited_viewer",role:"viewer",scopes:[...grantScopes],protectedContent:false};
  await asActor(owner,null,()=>collab.changeWorldCollaboration(owner,f.worldA,viewerInvite));
  await asActor(owner,null,()=>collab.changeWorldCollaboration(owner,f.worldA,viewerInvite));
  let inbox=await collab.worldInvitationInbox(viewer);assert.equal(inbox.length,1);assert.equal(inbox[0].state,"pending");
  await assert.rejects(asActor(viewer,null,()=>service.getWorld(viewer,f.worldA)),denied(404));
  await assert.rejects(asActor("collab-player",null,()=>collab.decideWorldInvitation("collab-player",{action:"accept",requestId:randomUUID(),invitationId:inbox[0].id,revision:inbox[0].revision})),denied(404));
  const acceptViewer={action:"accept",requestId:randomUUID(),invitationId:inbox[0].id,revision:inbox[0].revision};await asActor(viewer,null,()=>collab.decideWorldInvitation(viewer,acceptViewer));
  const shared=await asActor(viewer,null,()=>service.getWorld(viewer,f.worldA));assert.equal(shared.permission?.role,"viewer");assert.equal(shared.canEdit,false);assert.ok(shared.entries.some(e=>e.id===f.ordinaryEntry));assert.ok(!shared.entries.some(e=>e.id===f.protectedEntry));assert.ok(!JSON.stringify(shared).includes("Private creator note"));
  await assert.rejects(asActor(viewer,null,()=>history.historyEntry(viewer,f.worldA,f.timelineA,f.protectedEntry)),denied(404));
  await assert.rejects(asActor(viewer,null,()=>access.authorizedWorldWrite(viewer,f.worldA,async()=>true,"history")),denied(403));
  await assert.rejects(asActor(viewer,null,()=>access.authorizeWorldRead(viewer,f.worldA,false,"craft")),denied(404));
  await assert.rejects(asActor(viewer,null,()=>collab.worldAccessAuditHistory(viewer,f.worldA)),denied(404));groups.push("pending invitation isolation, explicit acceptance, scopes and protected History");

  await asActor(owner,null,()=>collab.changeWorldCollaboration(owner,f.worldA,{...viewerInvite,requestId:randomUUID(),username:"invited_editor",role:"editor"}));
  inbox=await collab.worldInvitationInbox(editor);await asActor(editor,null,()=>collab.decideWorldInvitation(editor,{action:"accept",requestId:randomUUID(),invitationId:inbox[0].id,revision:inbox[0].revision}));
  const ownerProof=freshProof(),editorProof=freshProof();
  const owned=await asActor(owner,ownerProof,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof:ownerProof}));ownerProof.fence=owned.access.editor.fence!;assert.ok(owned.access.editor.yours);
  const secondTab=freshProof();await assert.rejects(asActor(owner,secondTab,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof:secondTab})),denied(409));
  await assert.rejects(asActor(editor,editorProof,()=>collab.changeWorldCollaboration(editor,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof:editorProof})),denied(409));
  const requestId=randomUUID();await asActor(editor,editorProof,()=>collab.changeWorldCollaboration(editor,f.worldA,{action:"request-control",requestId,proof:editorProof}));
  const handed=await asActor(owner,ownerProof,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"approve-control",requestId:randomUUID(),userId:editor,controlRequestId:requestId,confirm:true}));assert.equal(handed.access.editor.yours,false);
  const newControl=await asActor(editor,editorProof,()=>collab.getWorldCollaboration(editor,f.worldA));assert.equal(newControl.editor.yours,true);editorProof.fence=newControl.editor.fence!;
  await assert.rejects(asActor(owner,ownerProof,()=>access.authorizedWorldWrite(owner,f.worldA,async()=>true,"history")),denied(409));
  const visibleDuringEdit=await asActor(viewer,null,()=>service.getWorld(viewer,f.worldA));assert.equal(visibleDuringEdit.world.id,f.worldA);assert.equal(visibleDuringEdit.canEdit,false);groups.push("one active editor, independent-tab fencing and deliberate owner handoff");

  const before=await asActor(editor,editorProof,()=>history.historyEntry(editor,f.worldA,f.timelineA,f.ordinaryEntry));
  await asActor(editor,editorProof,()=>service.changeHistory(editor,f.worldA,{entity:"entry",timelineId:f.timelineA,id:before.id,revision:before.revision,action:"save",draft:{title:"Contributor accepted change",account:before.account,notes:"",visibility:"ordinary",time:before.time,accuracy:before.accuracy,narrative:before.narrative,eraIds:before.eraIds}}));
  const stored=(await f.pool.query('select notes,title from world_historical_entry where id=$1',[f.ordinaryEntry])).rows[0];assert.equal(stored.title,"Contributor accepted change");assert.ok(stored.notes.includes("Private creator note"));
  await assert.rejects(asActor(editor,editorProof,()=>service.changeHistory(editor,f.worldA,{entity:"entry",timelineId:f.timelineA,id:f.protectedEntry,revision:1,action:"archive"})),denied(404));
  await assert.rejects(asActor(editor,editorProof,()=>collab.changeWorldCollaboration(editor,f.worldA,{...viewerInvite,requestId:randomUUID(),username:"ordinary_player"})),denied(404));groups.push("scoped contributor writes preserve private notes and owner-only grants");

  await f.pool.query('update world_editor_lease set expires_at=clock_timestamp()-interval \'1 second\' where world_id=$1',[f.worldA]);
  await assert.rejects(asActor(editor,editorProof,()=>access.authorizedWorldWrite(editor,f.worldA,async()=>true,"history")),denied(409));
  const reclaimed=await asActor(owner,secondTab,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof:secondTab}));secondTab.fence=reclaimed.access.editor.fence!;assert.ok(secondTab.fence>ownerProof.fence!);
  await assert.rejects(asActor(editor,editorProof,()=>collab.changeWorldCollaboration(editor,f.worldA,{action:"renew-control",requestId:randomUUID(),proof:editorProof})),denied(409));
  await f.pool.query('update session set expires_at=clock_timestamp()-interval \'1 second\' where id=$1',[f.sessions.get(owner)]);
  await assert.rejects(asActor(owner,secondTab,()=>access.authorizedWorldWrite(owner,f.worldA,async()=>true,"history")),denied(409));
  await f.pool.query('update session set expires_at=clock_timestamp()+interval \'1 day\' where id=$1',[f.sessions.get(owner)]);groups.push("expired leases and expired authenticated sessions reject late operations");

  const {withWorldRetainedSourceRead}=await import("../src/features/worlds/world-retained-source-authority");
  await asActor(editor,editorProof,async()=>{const authorized=await access.authorizeWorldRead(editor,f.worldA,false,"history");await withWorldRetainedSourceRead(authorized,async()=>{const retained=await access.authorizeWorldRead(editor,f.worldA,false,"craft");assert.equal(retained.permission.actorId,editor);assert.equal(retained.ownerId,owner);assert.equal(retained.permission.canEdit,false);await assert.rejects(access.authorizedWorldWrite(editor,f.worldA,async()=>true,"history"),denied(403));});assert.equal(access.worldProtectedContent(f.worldA),false);await assert.rejects(access.authorizeWorldRead(editor,f.worldA,false,"craft"),denied(404));});groups.push("private baseline construction retains the actual actor, cannot write, and restores caller scope and protection");
  const originalDescription=(await f.pool.query("select description from world where id=$1",[f.worldA])).rows[0].description;
  await assert.rejects(asActor(owner,secondTab,()=>access.authorizedWorldWrite(owner,f.worldA,async tx=>{const {sql}=await import("drizzle-orm");await tx.execute(sql`update world set description='must roll back after expiry' where id=${f.worldA}`);await f.pool.query("update world_editor_lease set expires_at=clock_timestamp()-interval '1 second' where world_id=$1",[f.worldA]);},"history")),denied(409));assert.equal((await f.pool.query("select description from world where id=$1",[f.worldA])).rows[0].description,originalDescription);
  const contenders=[freshProof(),freshProof()],outcomes=await Promise.allSettled(contenders.map(proof=>asActor(owner,proof,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof}))));assert.equal(outcomes.filter(value=>value.status==="fulfilled").length,1);assert.equal(outcomes.filter(value=>value.status==="rejected"&&denied(409)(value.reason)).length,1);
  const winner=outcomes.findIndex(value=>value.status==="fulfilled"),winning=outcomes[winner];assert.equal(winning.status,"fulfilled");contenders[winner].fence=winning.value.access.editor.fence!;
  const blocker=await f.pool.connect();await blocker.query("begin");await blocker.query("select id from world where id=$1 for update",[f.worldA]);let callbackReached=false;const waiting=asActor(owner,contenders[winner],()=>access.authorizedWorldWrite(owner,f.worldA,async()=>{callbackReached=true;},"history")).then(()=>null,error=>error);
  try{await new Promise(resolve=>setTimeout(resolve,100));await f.pool.query("update world_editor_lease set expires_at=clock_timestamp()-interval '1 second' where world_id=$1",[f.worldA]);}finally{await blocker.query("rollback");blocker.release();}assert.ok(denied(409)(await waiting));assert.equal(callbackReached,false);groups.push("expiry during accepted work rolls back; concurrent control requests yield one fence; blocked late writes recheck the database clock");
  const {USER_ACCOUNT_FOREIGN_KEY_PLAN}=await import("../src/features/lifecycle/user-account-delete-plan"),actual=(await f.pool.query("select c.conname name,c.confdeltype action from pg_constraint c where c.contype='f' and c.confrelid='public.\"user\"'::regclass")).rows;assert.equal(actual.length,158);assert.deepEqual(actual.map(row=>row.name).sort(),USER_ACCOUNT_FOREIGN_KEY_PLAN.map(row=>row.constraintName.slice(0,63)).sort());assert.equal(actual.find(row=>row.name==="world_terrain_transfer_actor_id_user_id_fk")?.action,"r");const retained=actual.filter(row=>/^world_(access_|editor_lease)/.test(row.name));assert.equal(retained.length,7);assert.ok(retained.every(row=>row.action==="r"));await assert.rejects(f.pool.query('delete from "user" where id=$1',[viewer]),error=>!!error&&typeof error==="object"&&"code"in error&&["23503","23001"].includes(String(error.code)));groups.push("all 158 live user foreign keys match lifecycle policy; seven retained collaboration links restrict deletion");

  const manage=await asActor(owner,secondTab,()=>collab.getWorldCollaboration(owner,f.worldA,false,true)),viewerGrant=manage.participants.find(p=>p.userId===viewer)!;
  await asActor(owner,secondTab,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"revoke",requestId:randomUUID(),userId:viewer,revision:viewerGrant.revision}));
  await assert.rejects(asActor(viewer,null,()=>service.getWorld(viewer,f.worldA)),denied(404));await assert.rejects(asActor(viewer,null,()=>collab.decideWorldInvitation(viewer,acceptViewer)),denied(404));
  await f.pool.query('update world set name=$1 where id=$2',["New name after revocation must stay private",f.worldA]);const oldInbox=await collab.worldInvitationInbox(viewer);assert.equal(oldInbox[0].state,"revoked");assert.equal(oldInbox[0].worldName,"Owner A private World");groups.push("revocation rejects old accepted invitations and withholds new World metadata");

  const reviewed=await asActor(admin,null,()=>service.getWorld(admin,f.worldA,true),true);assert.equal(reviewed.permission?.role,"administrator-review");assert.equal(reviewed.canEdit,false);assert.ok(reviewed.entries.some(e=>e.id===f.protectedEntry));
  await assert.rejects(asActor(admin,null,()=>access.authorizedWorldWrite(admin,f.worldA,async()=>true,"history")),denied(404));
  await asActor(admin,null,()=>collab.recordAdministratorWorldReview(admin,f.worldA,{requestId:randomUUID(),note:"Reviewed explicit sharing and retained authorship."}));
  await assert.rejects(asActor(viewer,null,()=>collab.recordAdministratorWorldReview(viewer,f.worldA,{requestId:randomUUID(),note:"Not authorized"})),denied(403));
  const auditRows=(await f.pool.query('select to_jsonb(a) data from world_access_audit a where world_id=$1',[f.worldA])).rows.map(r=>r.data);assert.ok(auditRows.some(a=>a.action==="administrator-access-review"));assert.ok(auditRows.some(a=>a.action==="content-write"&&a.actor_id===editor));assert.ok(auditRows.some(a=>a.outcome==="denied"));
  for(const proof of [ownerProof,editorProof,secondTab])assert.ok(!JSON.stringify(auditRows).includes(proof.token));
  await assert.rejects(f.pool.query('update world_access_audit set action=$1 where world_id=$2',["forged",f.worldA]),/immutable/);await assert.rejects(f.pool.query('delete from world_access_audit where world_id=$1',[f.worldA]),/immutable/);groups.push("explicit read-only Administrator review and immutable credential-free audit");
  await writeFile(path.join(f.out,"foundation.json"),JSON.stringify({passed:true,groups,accounts:7,actualBrowserEvidence:false,scope:"Database/service foundation; complete UI, resource and inherited coverage still required",sharedDatabaseAccess:false},null,2));console.log("PASS collaboration foundation",groups.length,"groups");
}).catch(error=>{console.error(error instanceof Error?error.stack:"Collaboration validation failed");process.exitCode=1;});
