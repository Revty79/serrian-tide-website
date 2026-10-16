/** Reopen the two actual website-created islands and inspect their unobscured phone canvases. */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
async function main(){const results=[];
 for(const branch of ["manual","generated"]){const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,`library-${branch}-journey.json`),"utf8")),r=await islandRuntime("empty",`library-${branch}-phone`,f.environment);
  try{const c=await r.browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await c.newPage(),errors:string[]=[];await r.login(c);p.on("pageerror",e=>errors.push(e.message));await p.goto(f.editorUrl);const canvas=p.getByRole("application",{name:"Editable map canvas"}),nav=p.getByRole("navigation",{name:"Studio tools"});await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});
   if(branch==="generated"){await nav.getByRole("button",{name:"Geography",exact:true}).tap();const find=p.getByText("Find and read a source",{exact:true});await find.tap();await p.getByRole("button",{name:/^Read source: Generated coast/}).tap();await p.getByRole("button",{name:"Focus this source",exact:true}).tap();}
   await nav.getByRole("button",{name:"Layers",exact:true}).tap();await p.getByText("Geographic visibility",{exact:true}).tap();await p.getByLabel("Geographic labels",{exact:true}).uncheck();await p.getByRole("button",{name:"Close tool settings",exact:true}).tap();await p.waitForFunction(()=>!document.querySelector('[data-artwork-display-ready="false"],[data-terrain-cache-ready="false"]'));await p.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`docs/screenshots/worlds-geo-ux0a/full-library/journeys/${branch}-phone-map.png`});await p.getByRole("button",{name:"Zoom in",exact:true}).tap();await p.getByRole("button",{name:"Zoom in",exact:true}).tap();await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});await p.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`docs/screenshots/worlds-geo-ux0a/full-library/journeys/${branch}-phone-detail.png`});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);results.push({branch,mapId:f.mapId,browser:r.browser.version(),nativeTouchEmulation:true,unobscuredCanvas:true,zoomedWithNativeTap:true,errors});
  }finally{await r.close();}
 }
 await writeFile("docs/screenshots/worlds-geo-ux0a/full-library/journeys/phone-results.json",JSON.stringify({passed:true,scope:"Existing actual website journey maps reopened; only view settings changed, no content writes. Source labels intentionally hidden for the images; no persistent preference or physical phone claim.",results},null,2));console.log("PASS reopened actual island phone canvases and native-tap zoom");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
