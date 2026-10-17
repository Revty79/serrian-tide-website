/** Re-export the retained website studies through the corrected production UI, without content writes. */
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {ownedPool,UX0A_DIRECTORY,ux0aSnapshot} from "./worlds-geo-ux0a-harness";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {openStudioSection} from "./worlds-studio-test-tools";
const directory=path.join(UX0A_DIRECTORY,"performance-investigation","retained-artwork");
async function main(){await mkdir(directory,{recursive:true});const results=[];
 for(const branch of ["manual","generated"]){
  const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,`library-${branch}-journey.json`),"utf8")),r=await islandRuntime("empty",`performance-art-${branch}`,f.environment),pool=await ownedPool(f.environment,"empty");
  try{
   const protectedSnapshot=async()=>{const rows=await ux0aSnapshot(pool);delete rows.session;return rows;};
   const c=await r.browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});await r.login(c);const before=await protectedSnapshot(),p=await c.newPage(),errors:string[]=[],writes:string[]=[];p.on("pageerror",e=>errors.push(e.message));p.on("request",req=>{if(req.method()!=="GET"&&req.url().includes("/api/worlds/"))writes.push(new URL(req.url()).pathname);});
   const address=new URL(f.editorUrl);await p.goto(r.base+address.pathname+address.search);const canvas=p.getByRole("application",{name:"Editable map canvas"}),ready=async()=>{await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});await canvas.locator('[data-cartography-scene][data-artwork-ready="true"]').first().waitFor();};await ready();
   if(branch==="generated"){await openStudioSection(p,"Geography");const find=p.getByText("Find and read a source",{exact:true});if(!await find.evaluate(node=>node.parentElement!.hasAttribute("open")))await find.click();await p.getByRole("button",{name:/^Read source: Generated coast/}).click();await p.getByRole("button",{name:"Focus this source",exact:true}).click();await ready();}
   await openStudioSection(p,"Layers");const visibility=p.getByText("Geographic visibility",{exact:true});if(!await visibility.evaluate(node=>node.parentElement!.hasAttribute("open")))await visibility.click();await p.getByLabel("Geographic labels",{exact:true}).uncheck();
   for(const phone of [false,true]){
    if(phone)await p.setViewportSize({width:390,height:844});await openStudioSection(p,"Export");const start=performance.now(),download=p.waitForEvent("download");void download.catch(()=>{});await p.getByRole("button",{name:"Download visible map PNG",exact:true}).click();await(await download).saveAs(path.join(directory,`${branch}-${phone?"phone":"desktop"}-visible.png`));const exportMs=performance.now()-start;
    const close=p.getByRole("button",{name:"Close tool settings",exact:true});if(await close.isVisible())await close.click();await p.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:path.join(directory,`${branch}-${phone?"phone":"desktop"}-ui.png`)});assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);results.push({branch,phoneViewport:phone,touchEmulated:false,exportMs,contentWrites:0,pageErrors:0});
   }
   await c.close();assert.deepEqual(await protectedSnapshot(),before);console.log(`PASS retained ${branch} artwork exports and exact protected content`);
  }finally{await pool.end();await r.close();}
 }
 await writeFile(path.join(directory,"results.json"),JSON.stringify({passed:true,source:"Existing website-authored saved manual/generated studies; normal production UI PNG downloads, no content changes",allContentRowsExact:true,results},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
