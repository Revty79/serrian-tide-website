/** A3 uses only newly owned synthetic PostgreSQL/storage/accounts. No env files. */
import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {cp,readFile,readdir,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pg from "pg";
import {withCollaborationFixture,publicTableDigests} from "./worlds-collaboration-fixture";
import {restoreTerrainBackup} from "./terrain-backup-restore";
import {defaultAssetMetadata,type AssetPlacement} from "../src/features/worlds/atlas-assets";
import {DEFAULT_EXPORT_OPTIONS,exportCredits} from "../src/features/worlds/atlas-export";
import {sourceUses,type SourceEvidence,type SourceReview} from "../src/features/worlds/source-rights";
import type {WorldEditorProof} from "../src/features/worlds/world-permissions";
import {rightsCopies,rightsMigrationRollback} from "./worlds-source-rights-additional";

process.env.SERRIAN_COLLAB_OUT=process.env.SERRIAN_COLLAB_OUT??`artifacts/collaboration-s7b-a3-${Date.now()}`;
withCollaborationFixture(async f=>{
 const groups:string[]=[],owner="collab-owner-a",admin="collab-admin";
 const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),{db}=await import("../src/db"),rights=await import("../src/features/worlds/source-rights-service"),store=await import("../src/features/worlds/source-rights-store"),collab=await import("../src/features/worlds/world-collaboration-service"),terrain=await import("../src/features/worlds/terrain-service"),assets=await import("../src/features/worlds/atlas-asset-service"),exports=await import("../src/features/worlds/atlas-export-source"),access=await import("../src/features/worlds/world-access-service");
 const asActor=<T>(userId:string,proof:WorldEditorProof|null,run:()=>T,review=false)=>withWorldRequestAuthority({userId,sessionId:f.sessions.get(userId)!,proof,review,operationId:randomUUID(),reads:new Map()},run);
 const proof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")};
 proof.fence=(await asActor(owner,proof,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof}))).access.editor.fence!;
 const owned=<T>(run:()=>T)=>asActor(owner,proof,run),review=<T>(run:()=>T)=>asActor(admin,null,run,true);
 const mapId=randomUUID();await owned(()=>terrain.changeTerrain(owner,f.worldA,{action:"create",requestId:mapId,name:"A3 original editable map",initial:"land",settings:{widthKm:64,heightKm:32,gridWidth:32,gridHeight:32}}));
 const beforeTerrain=await owned(()=>terrain.getTerrain(owner,f.worldA,{mapId}));assert.ok(beforeTerrain.document);groups.push("fresh native authoring and legacy upgrade holds reviewed through actual administrative service");
 const bytes=await sharp({create:{width:24,height:24,channels:4,background:{r:50,g:100,b:150,alpha:1}}}).png().toBuffer(),assetId=randomUUID();
 const importImage={action:"import",requestId:randomUUID(),assetId,revision:0,metadata:{...defaultAssetMetadata("Unverified free claim"),license:"Free public domain (unverified claim)"},filename:"owned-synthetic.png",mime:"image/png"};
 await owned(()=>assets.changeAtlasAsset(owner,f.worldA,importImage,bytes));
 const placement:AssetPlacement={id:randomUUID(),assetId,version:1,name:"Synthetic image",x:100,y:100,width:100,height:100,rotation:0,opacity:1,flipX:false,flipY:false,visible:true,locked:false,tier:"overlay"};
 const compose={action:"compose",requestId:randomUUID(),target:{kind:"terrain",id:mapId},revision:0,layer:{version:1,placements:[placement]}};
 await assert.rejects(owned(()=>assets.changeAtlasAsset(owner,f.worldA,compose)),/licensing hold/);
 assert.equal((await f.pool.query("select count(*)::int n from atlas_composition where world_id=$1",[f.worldA])).rows[0].n,0);
 assert.ok((await owned(()=>assets.getAssetImage(owner,f.worldA,assetId,1,"128"))).length);
 groups.push("unverified artwork remains private for review; free-text PD claim cannot place or trace it; failed placement rolls back");
 const ownAsset=randomUUID();await owned(()=>assets.changeAtlasAsset(owner,f.worldA,{...importImage,requestId:randomUUID(),assetId:ownAsset,metadata:defaultAssetMetadata("Original synthetic artwork"),origin:{kind:"original",attestation:true}},bytes));
 await owned(()=>assets.changeAtlasAsset(owner,f.worldA,{...compose,requestId:randomUUID(),layer:{version:1,placements:[{...placement,assetId:ownAsset}]}}));
 const s=await owned(()=>rights.readSourceRights(owner,f.worldA));assert.equal(s.holds.length,0);groups.push("original artwork requires one declaration and remains editable without external licensing review");
 const sourceId=randomUUID(),evidence:SourceEvidence={classification:"public-domain",provider:"Owned synthetic fixture",dataset:"Synthetic licensing test only",edition:"1",sourceUrl:"https://example.org/source",license:"Synthetic permissive fixture",licenseUrl:"https://example.org/license",fileSha256:createHash("sha256").update(bytes).digest("hex"),retrievedAt:new Date().toISOString(),termsEvidence:"This test itself generated the colored square; no third-party source used.",serviceTerms:"No outside service contacted",upstream:"Only inline generated pixels",cost:"no-cost",requiredCredits:"Synthetic Fixture Provider; no external legal clearance claimed",modifications:"Recolored test square",exceptions:"None in this owned synthetic fixture"};
 const register={action:"register",requestId:randomUUID(),sourceId,evidence};
 await owned(()=>rights.changeSourceRights(owner,f.worldA,register));await owned(()=>rights.changeSourceRights(owner,f.worldA,register));
 await owned(()=>rights.changeSourceRights(owner,f.worldA,{action:"attach",requestId:randomUUID(),sourceId,note:"Reference-guided synthetic World map"}));
 await assert.rejects(owned(()=>access.authorizedWorldWrite(owner,f.worldA,async()=>true,"atlas")),/licensing hold/);
 await assert.rejects(owned(()=>exports.prepareAtlasExport(owner,f.worldA,{target:{kind:"terrain",id:mapId}})),/licensing hold/);
 assert.deepEqual((await owned(()=>terrain.getTerrain(owner,f.worldA,{mapId}))).document,beforeTerrain.document);
 const decision:SourceReview={decision:"approved",classification:"public-domain",reason:"Reviewed inline synthetic input",evidence:"The fixture generated the exact image; this is not approval of any real external dataset.",uses:[...sourceUses],credits:"Synthetic Fixture Provider",serviceVerified:true,upstreamVerified:true,noCostVerified:true,outputVerified:true,recipientRightsVerified:true};
 const approval={action:"review",requestId:randomUUID(),sourceId,revision:0,review:decision};
 for(const restriction of [{cost:"purchased" as const},{classification:"special-review" as const},{classification:"incompatible" as const}]){
  const heldId=randomUUID();await owned(()=>rights.changeSourceRights(owner,f.worldA,{action:"register",requestId:randomUUID(),sourceId:heldId,evidence:{...evidence,...restriction}}));
  await assert.rejects(review(()=>rights.changeSourceRights(admin,f.worldA,{...approval,requestId:randomUUID(),sourceId:heldId})),/Paid, incompatible or special-review/);
 }
 await assert.rejects(owned(()=>rights.changeSourceRights(owner,f.worldA,approval)),/Only an administrator/);
 await review(()=>rights.changeSourceRights(admin,f.worldA,{...approval,review:{...decision,outputVerified:false}}));
 await owned(()=>access.authorizedWorldWrite(owner,f.worldA,async()=>true,"atlas"));
 await assert.rejects(owned(()=>exports.prepareAtlasExport(owner,f.worldA,{target:{kind:"terrain",id:mapId}})),/product attribution/);
 await review(()=>rights.changeSourceRights(admin,f.worldA,{...approval,requestId:randomUUID(),revision:1}));
 const manifest=await owned(()=>exports.prepareAtlasExport(owner,f.worldA,{target:{kind:"terrain",id:mapId}}));
 const used=(await store.worldRightsSources(db,f.worldA)).sources.find(s=>s.id===sourceId)!;
 const another={...used,id:randomUUID(),evidence:{...evidence,dataset:"Second original synthetic reference"},reviews:used.reviews.map(r=>({...r,credits:"Second synthetic provider"}))};
 assert.deepEqual(store.mandatorySourceCredits([used,another]),store.mandatorySourceCredits([another,used]),"Database row order cannot change a prepared export's mandatory credits or pin");
 for(const format of ["png","jpeg","svg","pdf"] as const){const credits=exportCredits(manifest,{...DEFAULT_EXPORT_OPTIONS,format,title:false,attribution:false,context:false,dimensions:false,layers:[],bounds:{x:1,y:1,width:100,height:100}});assert.ok(credits.some(c=>c.includes("Synthetic Fixture Provider")));assert.ok(credits.some(c=>c.includes(evidence.licenseUrl)));assert.ok(!credits.some(c=>c.startsWith("Built by")));}
 groups.push("auditable administrator review; source/output gates separate; four format credit plans survive crop and optional-label hiding");
 const externalId=randomUUID();await owned(()=>assets.changeAtlasAsset(owner,f.worldA,{...importImage,requestId:randomUUID(),assetId:externalId,origin:{kind:"external",sourceId}},bytes));
 await owned(()=>assets.changeAtlasAsset(owner,f.worldA,{...compose,requestId:randomUUID(),revision:1,layer:{version:1,placements:[{...placement,assetId:externalId}]}}));
 await owned(()=>assets.changeAtlasAsset(owner,f.worldA,{...compose,requestId:randomUUID(),revision:2,layer:{version:1,placements:[]}}));
 assert.ok((await store.worldRightsSources(db,f.worldA)).sources.some(s=>s.subjectId===externalId));
 const copies=await rightsCopies(f,sourceId,proof);groups.push("template source selection and canon personal variations retain exact source ancestry");
 await review(()=>rights.changeSourceRights(admin,f.worldA,{...approval,requestId:randomUUID(),revision:2,review:{...decision,decision:"hold",reason:"Revoked synthetic review"}}));
 for(const id of[copies.copyId,copies.targetId])await assert.rejects(store.assertWorldSourceUse(db,id,["display","modify"]),/licensing hold/);
 await rightsMigrationRollback(f);groups.push("failed additive migration rolls back all new schema and exact old data; subsequent migration succeeds");
 await assert.rejects(owned(()=>exports.authorizeAtlasExportDelivery(owner,f.worldA,manifest.pin)),/licensing hold/);
 await assert.rejects(owned(()=>assets.changeAtlasAsset(owner,f.worldA,{...compose,requestId:randomUUID(),revision:3})),/licensing hold/);
 groups.push("upstream revocation blocks stale export pins and edits even after layer removal; lineage is cumulative");
 for(const table of ["atlas_source_rights","atlas_source_review","atlas_source_use","atlas_source_parent"]){await assert.rejects(f.pool.query(`delete from ${table}`),/append-only/);}
 const retained=await publicTableDigests(f.pool),dump=path.join(f.out,"a3-independent.dump");f.runPostgres("pg_dump",["-Fc","-f",dump,"--dbname",f.databaseUrl]);
 const target=new URL(f.restoredUrl),bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",exe=(name:string)=>path.join(bin,name+(process.platform==="win32"?".exe":""));
 await restoreTerrainBackup({pgRestore:exe("pg_restore"),psql:exe("psql"),dump,sql:path.join(f.out,"restored.sql"),host:target.hostname,port:Number(target.port),user:target.username,database:target.pathname.slice(1),singleTransaction:true,streaming:true});
 async function files(root:string){const rows:Record<string,string>={};for(const name of(await readdir(root,{recursive:true})).sort()){const file=path.join(root,name);if((await stat(file)).isFile())rows[name]=createHash("sha256").update(await readFile(file)).digest("hex");}return rows;}
 for(const root of [f.terrainRoot,f.assetRoot]){const before=await files(root),copy=root+"-a3-restored";await cp(root,copy,{recursive:true});assert.deepEqual(await files(copy),before);assert.deepEqual(await files(root),before);}
 const restored=new pg.Pool({connectionString:f.restoredUrl});try{assert.deepEqual(await publicTableDigests(restored),retained);}finally{await restored.end();}
 groups.push("immutable source/evidence/review/use rows and independent PostgreSQL restore equality");
 await writeFile(path.join(f.out,"source-rights-results.json"),JSON.stringify({passed:true,groups,world:f.worldA,mapId,sourceId,noSharedEnvironment:true},null,2));console.log(JSON.stringify({passed:true,groups}));
}).catch(e=>{console.error(e);process.exitCode=1;});
