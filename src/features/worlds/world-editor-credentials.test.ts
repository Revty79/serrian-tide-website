import assert from "node:assert/strict";
import test from "node:test";
import {beginWorldEditorBootstrapCheck,finishWorldEditorBootstrap,acceptWorldResponse,applyWorldEditorStatus,initializeWorldEditor,loadWorldEditorLatest,worldEditorHeaders,worldClientUrl,worldRequestActor} from "./world-editor-credentials";
import {worldScopes,type WorldPermission} from "./world-permissions";
const owner:WorldPermission={actorId:"owner",role:"owner",scopes:[...worldScopes],protectedContent:true,canEdit:false,canCreateWorld:true,grantRevision:null};
test("editing readiness requires a current fenced source read and ignores an older uncredentialed read",async()=>{
 const prior=globalThis.window;Object.defineProperty(globalThis,"window",{value:{location:{href:"https://worlds.invalid/",origin:"https://worlds.invalid"}},configurable:true});
 try{const id=crypto.randomUUID(),url=`/api/worlds/${id}`,client=initializeWorldEditor(id,owner);
  assert.equal(worldClientUrl(url+"/assets?review=1&limit=10"),url+"/assets?limit=10");assert.equal(worldClientUrl("https://unrelated.invalid"+url+"?review=1"),"https://unrelated.invalid"+url+"?review=1");assert.equal(worldRequestActor("https://unrelated.invalid"+url),undefined);assert.equal(worldRequestActor(url),"owner");const reviewed=crypto.randomUUID();initializeWorldEditor(reviewed,{...owner,actorId:"admin",role:"administrator-review"});assert.equal(worldClientUrl(`/api/worlds/${reviewed}/assets?review=1`),`/api/worlds/${reviewed}/assets?review=1`);
  applyWorldEditorStatus(client,{worldId:id,worldName:"World",ownerId:"owner",permission:owner,archived:false,available:true,canManage:true,participants:[],invitations:[],pendingControlRequests:[],editor:{holder:{userId:"owner",name:"Owner",username:null},yours:true,fence:2,expiresAt:new Date(Date.now()+120000).toISOString(),available:false,requestPending:false}});
  await loadWorldEditorLatest(client,async()=>{acceptWorldResponse(url,"owner",{permission:{...owner,canEdit:true}},2);});assert.equal(client.permission.canEdit,true);
  acceptWorldResponse(url,"owner",{permission:{...owner,canEdit:false}});assert.equal(client.permission.canEdit,true,"An older read without this fence cannot withdraw a later confirmed lease");
  const old=worldEditorHeaders("https://worlds.invalid"+url)["X-World-Editor"];
  applyWorldEditorStatus(client,{worldId:id,worldName:"World",ownerId:"owner",permission:owner,archived:false,available:true,canManage:true,participants:[],invitations:[],pendingControlRequests:[],editor:{holder:{userId:"owner",name:"Owner",username:null},yours:true,fence:3,expiresAt:new Date(Date.now()+120000).toISOString(),available:false,requestPending:false}});
  await loadWorldEditorLatest(client,async()=>{acceptWorldResponse(url,"owner",{permission:{...owner,role:"viewer",grantRevision:1,canEdit:false}},3);});assert.equal(client.permission.canEdit,false,"A downgrade while loading accepted state must never enable a Viewer");assert.equal(client.readyFence,null);assert.equal(JSON.parse(old).fence,2,"An already captured request retains its original fence");
 }finally{Object.defineProperty(globalThis,"window",{value:prior,configurable:true});}
});


test("Owner startup settles after all overlapping checks without granting a fence",()=>{
 const client=initializeWorldEditor(crypto.randomUUID(),owner),first=beginWorldEditorBootstrapCheck(client),second=beginWorldEditorBootstrapCheck(client);
 assert.equal(client.bootstrapping,true);first();assert.equal(client.bootstrapping,true);finishWorldEditorBootstrap(client);assert.equal(client.bootstrapping,true);
 second();assert.equal(client.bootstrapping,false);assert.equal(client.permission.canEdit,false);assert.equal(client.readyFence,null);assert.equal(client.proof.fence,undefined);
 const version=client.version;first();second();finishWorldEditorBootstrap(client);assert.equal(client.version,version,"Settled checks do not keep rerendering the map");
});
test("invited readers, Editors and privileged reviewers never wait for Owner startup",()=>{
 for(const role of ["viewer","editor","administrator-review"] as const){const client=initializeWorldEditor(crypto.randomUUID(),{...owner,role});assert.equal(client.bootstrapping,false);beginWorldEditorBootstrapCheck(client)();assert.equal(client.permission.canEdit,false);}
});
test("failed Owner startup can show saved work while synchronization stays blocked",()=>{
 const client=initializeWorldEditor(crypto.randomUUID(),owner),settle=beginWorldEditorBootstrapCheck(client);client.error="Editing control unavailable";settle();assert.equal(client.bootstrapping,false);assert.equal(client.permission.canEdit,false);assert.equal(client.error,"Editing control unavailable");assert.equal(client.verifiedFence,null);
});

test("a canon decision withdraws current editing readiness and an older fenced response cannot unlock it",async()=>{
 const prior=globalThis.window;Object.defineProperty(globalThis,"window",{value:{location:{href:"https://worlds.invalid/",origin:"https://worlds.invalid"}},configurable:true});
 try{
  const id=crypto.randomUUID(),url=`/api/worlds/${id}`,client=initializeWorldEditor(id,owner);
  applyWorldEditorStatus(client,{worldId:id,worldName:"World",ownerId:"owner",permission:owner,archived:false,available:true,canManage:true,participants:[],invitations:[],pendingControlRequests:[],editor:{holder:{userId:"owner",name:"Owner",username:null},yours:true,fence:2,expiresAt:new Date(Date.now()+120000).toISOString(),available:false,requestPending:false}});
  await loadWorldEditorLatest(client,async()=>acceptWorldResponse(url,"owner",{permission:{...owner,canEdit:true}},2));assert.equal(client.permission.canEdit,true);
  acceptWorldResponse(url,"owner",{permission:{...owner,canEdit:false,canon:true,canonRevision:1}});assert.equal(client.permission.canEdit,false);assert.equal(client.readyFence,null);assert.equal(client.editor.yours,false);
  acceptWorldResponse(url,"owner",{permission:{...owner,canEdit:true}},2);assert.equal(client.permission.canEdit,false);assert.equal(client.permission.canon,true);
 }finally{Object.defineProperty(globalThis,"window",{value:prior,configurable:true});}
});
