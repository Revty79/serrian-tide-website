/** Fresh inline geometry, source evidence and accounts only. No external datasets or shared services. */
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {withCollaborationFixture,collaborationPassword} from "./worlds-collaboration-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {claimOwnedWorldPage} from "./worlds-owned-world-api";
import {createRightsMaps} from "./worlds-source-rights-maps";
import {sourceUses,type SourceReview} from "../src/features/worlds/source-rights";
import type {WorldEditorProof} from "../src/features/worlds/world-permissions";

process.env.SERRIAN_COLLAB_OUT=process.env.SERRIAN_COLLAB_OUT??`artifacts/collaboration-s7b-a3-browser-${Date.now()}`;
withCollaborationFixture(async f=>{
 const owner="collab-owner-a",admin="collab-admin",groups:string[]=[],files:unknown[]=[];
 const {withWorldRequestAuthority}=await import("../src/features/worlds/world-authorization-context"),collab=await import("../src/features/worlds/world-collaboration-service"),rights=await import("../src/features/worlds/source-rights-service"),exports=await import("../src/features/worlds/atlas-export-source"),contracts=await import("../src/features/worlds/atlas-map-consumption-service");
 const asActor=<T>(userId:string,proof:WorldEditorProof|null,run:()=>T,review=false)=>withWorldRequestAuthority({userId,sessionId:f.sessions.get(userId)!,proof,review,operationId:randomUUID(),reads:new Map()},run);
 const proof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")};proof.fence=(await asActor(owner,proof,()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"acquire-control",requestId:randomUUID(),proof}))).access.editor.fence!;
 const owned=<T>(run:()=>T)=>asActor(owner,proof,run),review=<T>(run:()=>T)=>asActor(admin,null,run,true);
 const maps=await owned(()=>createRightsMaps(f));
 for(let i=0;i<maps.routes.length;i++){
  const route=maps.routes[i],state=maps.states[i];const {edit:_,...contract}=state;void _;
  assert.equal((await owned(()=>exports.prepareAtlasExport(owner,f.worldA,{target:route.target}))).family,route.family);
  assert.equal((await owned(()=>exports.prepareAtlasExport(owner,f.worldA,{target:route.target,historical:state}))).family,route.family);
  await owned(()=>contracts.readAtlasMapContract(owner,f.worldA,contract));
 }
 groups.push("all seven original native families: current exports, immutable historical exports and Stage 7C reads");
 await owned(()=>collab.changeWorldCollaboration(owner,f.worldA,{action:"release-control",requestId:randomUUID(),proof}));
 await writeFile(path.join(f.out,"maps.json"),JSON.stringify(maps,null,2));
 await withCollaborationBrowser(f,async b=>{
  const outputs=path.join(f.out,"outputs");await mkdir(outputs);
  const context=await b.browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{"cf-connecting-ip":"198.51.100.231"}}),p=await context.newPage();p.setDefaultTimeout(60000);p.on("dialog",d=>d.accept());const errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
  await p.goto(b.base+"/login");await p.getByLabel("Username or Email",{exact:true}).fill("owner_a");await p.getByLabel("Password",{exact:true}).fill(collaborationPassword);await p.getByRole("button",{name:"Enter",exact:true}).click();await p.waitForURL(url=>!url.pathname.startsWith("/login"));
  const root=b.base+`/worlds/${f.worldA}?tab=atlas`,url=root+"&"+maps.routes[0].query;await p.goto(url);await claimOwnedWorldPage(p,b.base);
  const panel=p.getByRole("region",{name:"Sources and rights"});await panel.getByRole("button",{name:"Sources & rights",exact:true}).click();await panel.getByText("Register an external source",{exact:true}).click();
  await panel.getByLabel("Claimed category",{exact:true}).selectOption("attribution");await panel.getByLabel("Cost / access",{exact:true}).selectOption("no-cost");
  const fields={"Provider / rightsholder":"A3 Synthetic Provider","Dataset or artwork title":"A3 original synthetic reference","Exact edition or version":"1","Official source URL":"https://example.org/a3-source","License name and version":"Owned synthetic licensing fixture","Official license URL":"https://example.org/a3-license","Original file SHA-256":"a".repeat(64),"Retained license evidence and exceptions":"All geometry and pixels authored inline in this test. No outside material.","Download / service terms and approved access":"No external download or service used.","Upstream providers and permissions":"Only fixture-authored content.","Complete required notices":"A3 Synthetic Provider — required fixture notice","Changes made / planned":"Original synthetic geometry with a simulated reference link.","Material-specific exceptions (enter None if verified)":"None in this owned test."};
  for(const [label,value]of Object.entries(fields))await panel.getByLabel(label,{exact:true}).fill(value);
  await panel.getByRole("button",{name:"Register for review",exact:true}).click();const article=panel.locator("article").filter({hasText:"A3 original synthetic reference"});await article.getByRole("button",{name:"Use as a World reference"}).waitFor();await article.getByRole("button",{name:"Use as a World reference"}).click();await panel.getByLabel("Describe the affected maps or reference-guided work").fill("All seven owned synthetic families; test mandatory credits and holds.");await panel.getByRole("button",{name:"Retain source link"}).click();await panel.getByText(/Licensing review needed/).waitFor();await p.screenshot({path:path.join(f.out,"owner-source-hold.png")});
  const source=(await f.pool.query("select id from atlas_source_rights where evidence->>'dataset'=$1",[fields["Dataset or artwork title"]])).rows[0].id as string;
  const decision:SourceReview={decision:"approved",classification:"attribution",reason:"Owned synthetic evidence reviewed",evidence:"Inline test geometry and UI evidence; no real provider clearance claimed.",uses:[...sourceUses],credits:fields["Complete required notices"],serviceVerified:true,upstreamVerified:true,noCostVerified:true,outputVerified:true,recipientRightsVerified:true};
  const denied=await context.request.post(b.base+"/api/worlds/source-rights",{headers:{Origin:b.base},data:{worldId:f.worldA,command:{action:"review",requestId:randomUUID(),sourceId:source,revision:0,review:decision}}});assert.equal(denied.status(),403);
  const adminContext=await b.login(admin),a=await adminContext.newPage();a.setDefaultTimeout(60000);await a.goto(url+"&review=1");const ap=a.getByRole("region",{name:"Sources and rights"});await ap.getByRole("button",{name:"Sources & rights",exact:true}).click();await ap.locator("article").filter({hasText:fields["Dataset or artwork title"]}).getByRole("button",{name:"Review source",exact:true}).click();
  await ap.getByLabel("Decision",{exact:true}).selectOption("approved");await ap.getByLabel("Verified source category",{exact:true}).selectOption("attribution");await ap.getByLabel("Decision and next steps",{exact:true}).fill(decision.reason);await ap.getByLabel("Dated evidence checked by this reviewer",{exact:true}).fill(decision.evidence);await ap.getByLabel("Complete mandatory notices",{exact:true}).fill(decision.credits);
  for(const use of sourceUses)await ap.getByLabel(use.replaceAll("-"," "),{exact:true}).check();
  for(const label of ["I verified the actual access/service terms.","I verified upstream ownership and material-specific exceptions.","No paid, trial or noncommercial permission is required.","I inspected actual attribution in the applicable views and outputs.","Customer terms preserve the source license and recipient rights."])await ap.getByLabel(label,{exact:true}).check();
  await ap.getByRole("button",{name:"Record review decision",exact:true}).click();await ap.getByText(/No source hold for this World/).waitFor();await a.screenshot({path:path.join(f.out,"administrator-recorded-review.png")});await a.close();await adminContext.close();
  await p.reload();await p.getByLabel("Mandatory external source credits").waitFor();assert.ok((await p.getByLabel("Mandatory external source credits").innerText()).includes("A3 Synthetic Provider"));groups.push("visible login, evidence registration, held reference, denied uploader approval, visible administrator review and saved/reopened mandatory credits");
  for(let i=0;i<maps.routes.length;i++){
   await asActor(owner,null,()=>exports.prepareAtlasExport(owner,f.worldA,{target:maps.routes[i].target,historical:maps.states[i]}));
   await assert.rejects(asActor(owner,null,()=>contracts.readAtlasMapContract(owner,f.worldA,(({edit:_,...scope})=>{void _;return scope;})(maps.states[i]))),/cannot deliver mandatory source notices/);
  }
  async function open(query:string){await p.goto(root+"&"+query);await p.getByRole("button",{name:"Export / Print",exact:true}).filter({visible:true}).last().click();const d=p.getByRole("dialog",{name:"Atlas export and print",exact:true});await d.getByRole("status").filter({hasText:"Accepted saved source ready"}).waitFor();const show=d.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();return d;}
  async function download(d:ReturnType<typeof p.getByRole>,name:string){const pending=Promise.race([p.waitForEvent("download"),d.getByRole("alert").waitFor({state:"visible"}).then(async()=>{throw Error(await d.getByRole("alert").innerText());})]);await d.getByRole("button",{name:/^(Generate & download|Download print PDF)$/}).click();const got=await pending,file=path.join(outputs,name);await got.saveAs(file);const bytes=await readFile(file);assert.ok(bytes.length>1000);files.push({name,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});console.log("PASS output",name);return file;}
  for(const route of maps.routes){const d=await open(route.query);await d.getByLabel("Image size",{exact:true}).selectOption("1200");const file=await download(d,`${route.family}.png`);assert.equal((await sharp(file).metadata()).format,"png");await d.getByLabel("Format",{exact:true}).selectOption("pdf");await d.getByLabel("Resolution / DPI",{exact:true}).selectOption("96");await download(d,`${route.family}.pdf`);await d.getByRole("button",{name:"Close export",exact:true}).click();}
  const d=await open(maps.routes[2].query);await d.getByLabel("Area",{exact:true}).selectOption("selected");await d.getByRole("button",{name:"Draw new area",exact:true}).click();const box=(await d.getByLabel("Saved map area selection",{exact:true}).boundingBox())!;await p.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await p.mouse.down();await p.mouse.move(box.x+box.width*.65,box.y+box.height*.65,{steps:8});await p.mouse.up();await d.getByLabel("Map pixel width",{exact:true}).fill("1200");
  // Optional creator/labels are independent of mandatory notices.
  await d.getByText("Measurements and source text",{exact:true}).click();
  for(const name of ["Creator and World provenance","Map title","Saved / historical source context","Physical extent dimensions"])await d.getByLabel(name,{exact:true}).uncheck();
  await d.getByText("Appearance and layers",{exact:true}).click();await d.getByLabel("Style",{exact:true}).selectOption("monochrome");
  await d.getByLabel("Labels",{exact:true}).uncheck();assert.equal(await d.getByLabel("Labels",{exact:true}).isChecked(),false);
  for(const format of ["png","jpeg","svg","pdf"]){await d.getByLabel("Format",{exact:true}).selectOption(format);await download(d,`crop.${format}`);}
  await d.getByLabel("Scale",{exact:true}).selectOption("scale");await d.getByLabel("Poster / multiple pages",{exact:true}).check();await d.getByLabel("Scale denominator",{exact:true}).fill(String(Number(await d.getByLabel("Area width",{exact:true}).inputValue())*1000/450));await d.getByLabel("Resolution / DPI",{exact:true}).selectOption("96");await download(d,"poster.pdf");await d.getByRole("button",{name:"Preview output",exact:true}).click();await d.getByAltText("Prepared pdf output, page 1").waitFor();await p.screenshot({path:path.join(f.out,"mandatory-poster-preview.png")});await d.getByRole("button",{name:"Close export",exact:true}).click();
  groups.push("seven-family actual PNG/PDF downloads; cropped four-format outputs and multi-page print poster");
  await review(()=>rights.changeSourceRights(admin,f.worldA,{action:"review",requestId:randomUUID(),sourceId:source,revision:1,review:{...decision,decision:"hold",reason:"Synthetic revocation test"}}));
  for(const route of maps.routes)await assert.rejects(asActor(owner,null,()=>exports.prepareAtlasExport(owner,f.worldA,{target:route.target})),/licensing hold/);
  await p.reload();await p.getByRole("region",{name:"Sources and rights"}).getByText(/Licensing review needed/).waitFor();groups.push("later source hold blocks all seven output families and is visible after reload");
  assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"browser-rights-results.json"),JSON.stringify({passed:true,groups,files,sourceHash:b.sourceHash,buildId:b.buildId,headed:true,gpuDisabled:true,ownerAcceptance:false},null,2));console.log(JSON.stringify({passed:true,groups}));
 });
}).catch(e=>{console.error(e);process.exitCode=1;});
