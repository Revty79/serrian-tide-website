import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import type {BrowserContext,Page} from "playwright-core";
import {regionalFixtureIds as ids,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {terrainTool,terrainPanel,closeTerrainSettings} from "./worlds-terrain-browser-ui";
import {environmentReady} from "./worlds-environment-browser-checks";

/** Measure actual composed frames throughout native strokes, not just after settling. */
export async function sculptVisibilityBrowser({f,context,page:p,base}:{f:RegionalFixture;context:BrowserContext;page:Page;base:string}){
 p.setDefaultTimeout(180000);
 await p.addInitScript(()=>{
  type Frame={images:number;coverage:number[];x:string|undefined;y:string|undefined;zoom:string|undefined;width:number;height:number;data:Record<string,string|undefined>};
  const state={capture:false,frames:[] as Frame[],current:null as Frame|null};
  (window as unknown as {sculptFrames:typeof state}).sculptFrames=state;
  const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,draw=proto.drawImage;
  proto.clearRect=function(...args){if(state.capture&&this.canvas.getAttribute("aria-label")==="Terrain map canvas"){
   if(state.current)state.frames.push(state.current);const d=this.canvas.dataset;
   state.current={images:0,coverage:Array(32*24).fill(0),x:d.viewX,y:d.viewY,zoom:d.zoom,width:this.canvas.width,height:this.canvas.height,data:{...d}};
  }return clear.apply(this,args);};
  proto.drawImage=function(this:CanvasRenderingContext2D,...args:unknown[]){if(state.capture&&this.canvas.getAttribute("aria-label")==="Terrain map canvas"&&state.current){const f=state.current;f.images++;if(f.images>1&&args.length===9){const [x,y,w,h]=args.slice(5) as number[],t=this.getTransform(),a=t.transformPoint({x,y}),b=t.transformPoint({x:x+w,y:y+h});for(let row=0;row<24;row++)for(let col=0;col<32;col++){const px=(col+.5)/32*this.canvas.width,py=(row+.5)/24*this.canvas.height;if(px>=Math.min(a.x,b.x)&&px<=Math.max(a.x,b.x)&&py>=Math.min(a.y,b.y)&&py<=Math.max(a.y,b.y))f.coverage[row*32+col]=1;}}}return Reflect.apply(draw,this,args);};
 });
 const canvas=p.getByLabel("Terrain map canvas",{exact:true}),results=[];
 const frames=()=>p.evaluate(()=>{type Frame={images:number;coverage:number[];x:string;y:string;zoom:string};const s=(window as unknown as {sculptFrames:{frames:Frame[];current:Frame|null}}).sculptFrames;return [...s.frames,...s.current?[s.current]:[]];});
 const debug=process.env.SERRIAN_SCULPT_REGION_DEBUG==="1",extreme=process.env.SERRIAN_SCULPT_EXTREME_ONLY==="1",styles=debug?["engraved-fantasy"]:extreme||process.env.SERRIAN_SCULPT_WORKER_OFF==="1"?["realistic-terrain","engraved-fantasy"]:["realistic-terrain","engraved-fantasy","illustrated-fantasy","physical-relief","classic-elevation","topographic"];
 for(const map of debug?[ids.a]:[ids.parent,ids.a])for(const style of styles)for(const zoom of debug?["fit"]:extreme?["extreme"]:process.env.SERRIAN_SCULPT_WORKER_OFF==="1"?["close"]:["fit","close"]){
  await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${map}${map===ids.a?"&terrainDetail="+f.fine:""}${process.env.SERRIAN_SCULPT_WORKER_OFF==="1"?"&terrainWorker=off":""}`);await canvas.waitFor();
  if(map===ids.a){await terrainPanel(p,"Terrain detail");await p.getByTestId("terrain-active-detail").filter({hasText:"Shared contained numerical detail"}).waitFor();await p.getByRole("button",{name:"Go to active terrain",exact:true}).click();}
  const settle=async()=>{await environmentReady(p);if(style==="engraved-fantasy")await p.waitForFunction(()=>document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]')?.dataset.engravingPending==="0");};
  await terrainPanel(p,"World");await p.getByLabel("Map Appearance",{exact:true}).selectOption(style);await terrainTool(p,results.length%2?"lower":"raise");const readyBy=Date.now()+60000;while(!await p.getByLabel(/^Brush strength:/).isEnabled()){assert.ok(Date.now()<readyBy,"Sculpt tool ready");await p.waitForTimeout(100);}await closeTerrainSettings(p);await settle();
  const readRevision=async()=>map===ids.parent?(await(await context.request.get(`${base}/api/worlds/${f.world}/terrain?terrainMap=${map}`)).json()).document.revision:(await(await context.request.get(`${base}/api/worlds/${f.world}/terrain/refinements?terrainMap=${map}`)).json()).refinements.find((r:{id:string})=>r.id===f.fine).revision,revision=await readRevision();
  if(zoom!=="fit"){const b=(await canvas.boundingBox())!;await p.mouse.move(b.x+b.width*.5,b.y+b.height*.5);for(let n=0;n<(extreme?4:1);n++){await p.mouse.wheel(0,-1800);await p.waitForTimeout(100);}await settle();if(extreme)assert.equal(Number(await canvas.getAttribute("data-zoom")),100,"Maximum supported zoom");}
  await canvas.evaluate(c=>{const s=(window as unknown as {sculptFrames:{capture:boolean;frames:unknown[];current:unknown}}).sculptFrames;s.capture=true;s.frames=[];s.current=null;c.dispatchEvent(new PointerEvent("pointermove",{clientX:1,clientY:1}));});
  const box=(await canvas.boundingBox())!,start={x:box.x+box.width*.45,y:box.y+box.height*.5};assert.ok(await p.evaluate(q=>document.elementFromPoint(q.x,q.y)?.matches('canvas[aria-label="Terrain map canvas"]'),start));await p.mouse.move(start.x,start.y);await p.waitForTimeout(100);const before=await frames(),settled=before.at(-1)!;assert.ok(settled.images>0);
  await p.mouse.down();for(let n=0;n<25;n++){await p.mouse.move(box.x+box.width*(.45+n*.004),box.y+box.height*(.5+Math.sin(n/6)*.02));await p.waitForTimeout(65);if(n===12)await canvas.screenshot({path:`${f.out}/sculpt-${map===ids.parent?"world":"regional"}-${style}-${zoom}-during.png`});}await p.mouse.up();
  const moving=await frames();await settle();await p.mouse.move(1,1);await canvas.screenshot({path:`${f.out}/sculpt-${map===ids.parent?"world":"regional"}-${style}-${zoom}-after.png`});
  const minImages=Math.min(...moving.map(v=>v.images)),viewStable=moving.every(v=>v.x===settled.x&&v.y===settled.y&&v.zoom===settled.zoom),missingCoverage=Math.max(...moving.map(v=>v.coverage.filter((n,i)=>settled.coverage[i]&&!n).length));
  const row={map,style,zoom,settledImages:settled.images,minImages,settledCoverage:settled.coverage.filter(Boolean).length,missingCoverage,frames:moving.length,viewStable,editedSamples:Number(await canvas.getAttribute("data-last-stroke-samples")),data:await canvas.evaluate(c=>({...c.dataset}))};results.push(row);await writeFile(f.out+"/sculpt-visibility.json",JSON.stringify({results},null,2));assert.ok(viewStable,JSON.stringify(row));assert.ok(row.editedSamples>0,JSON.stringify(row));
  if(process.env.SERRIAN_SCULPT_DIAGNOSE!=="1")assert.equal(missingCoverage,0,`Styled coverage disappeared during sculpt: ${JSON.stringify(row)}`);
  const deadline=Date.now()+60000;while(await readRevision()<=revision){assert.ok(Date.now()<deadline,"Sculpt stroke saved before another navigation");await p.waitForTimeout(250);}await p.waitForTimeout(1000);await settle();const acknowledged=await frames(),afterSaveMissingCoverage=Math.max(...acknowledged.map(v=>v.coverage.filter((n,i)=>settled.coverage[i]&&!n).length));if(afterSaveMissingCoverage)await writeFile(f.out+"/sculpt-failure-frames.json",JSON.stringify({settled,acknowledged}));assert.equal(afterSaveMissingCoverage,0,"Terrain remains visible through autosave acknowledgement");assert.ok(acknowledged.every(v=>v.x===settled.x&&v.y===settled.y&&v.zoom===settled.zoom));if(process.env.SERRIAN_SCULPT_WORKER_OFF==="1")assert.equal(await canvas.getAttribute(style==="realistic-terrain"?"data-surface-backend":"data-engraving-backend"),"main-thread");results[results.length-1]={...row,afterSaveMissingCoverage};await writeFile(f.out+"/sculpt-visibility.json",JSON.stringify({results},null,2));
 }
 assert.equal((await context.request.get(`${base}/api/worlds/${f.world}/terrain?terrainMap=${ids.parent}`)).status(),200);
 await writeFile(f.out+"/sculpt-visibility.json",JSON.stringify({passed:true,headed:true,gpuDisabled:true,workerOff:process.env.SERRIAN_SCULPT_WORKER_OFF==="1",results},null,2));
}
