/** Diagnostic timings only; the unchanged acceptance runner remains authoritative. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
import {openStudioSection} from "./worlds-studio-test-tools";

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const arg=(name:string,fallback:string)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split("=")[1]??fallback;
async function main(){
 const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"library-performance-current.json"),"utf8"));
 const width=Number(arg("width","1024")),height=Number(arg("height","768")),rate=Number(arg("rate","1")),touch=process.argv.includes("--touch"),label=arg("label","diagnosis");
 assert.match(label,/^[a-zA-Z0-9-]+$/);assert.ok([1,6].includes(rate));
 const output=path.join(UX0A_DIRECTORY,"performance-investigation",label);await mkdir(output,{recursive:true});
 const runtime=await islandRuntime("empty",label,f.environment),{browser,base}=runtime;
 try{
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,acceptDownloads:true});await runtime.login(context);
  const page=await context.newPage(),cdp=await context.newCDPSession(page),browserCdp=await browser.newBrowserCDPSession();
  const hardware=await browserCdp.send("SystemInfo.getInfo"),requests:unknown[]=[],errors:string[]=[];
  page.on("response",r=>{if(r.url().includes("/api/"))requests.push({path:new URL(r.url()).pathname,status:r.status(),timing:r.request().timing()});});page.on("pageerror",e=>errors.push(e.message));
  await cdp.send("Emulation.setCPUThrottlingRate",{rate});
  await page.goto(`${base}/worlds/${f.world}?tab=atlas&timeline=${f.timeline}&editMap=${f.map}`);
  const canvas=page.getByRole("application",{name:"Editable map canvas"});await canvas.waitFor();await page.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached",timeout:90000});
  await page.waitForFunction(()=>!document.querySelector('[data-terrain-cache-ready="false"],[data-artwork-display-ready="false"]'),undefined,{timeout:90000});await page.evaluate(()=>document.fonts.ready);await page.waitForLoadState("networkidle");
  assert.equal(await canvas.locator('g[data-drawing]').count(),100);assert.equal(await page.locator('[data-terrain-source-marks]').evaluateAll(nodes=>nodes.reduce((n,node)=>n+Number(node.getAttribute('data-terrain-source-marks')),0)),1500);
  await openStudioSection(page,"Artwork");await page.getByLabel("Artwork tool",{exact:true}).selectOption("pan");const dismiss=page.getByRole("button",{name:"Close tool settings",exact:true});if(await dismiss.isVisible())await dismiss.click();await page.getByRole("button",{name:"Zoom in",exact:true}).click();await page.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached",timeout:90000});await page.waitForFunction(()=>!document.querySelector('[data-terrain-cache-ready="false"],[data-artwork-display-ready="false"]'),undefined,{timeout:90000});await pause(500);
  if(process.argv.includes("--shared-mask"))await canvas.evaluate(svg=>{
   for(const layer of svg.querySelectorAll('g[data-layer="terrain"]')){
    const children=[...layer.querySelectorAll('[mask],[clip-path]')],first=children[0];if(!first)continue;
    for(const key of ['mask','clip-path']){const value=first.getAttribute(key);if(value)layer.setAttribute(key,value);for(const child of children)child.removeAttribute(key);}
   }
  });
  if(process.argv.includes("--promote"))await canvas.locator(":scope > g").first().evaluate(node=>(node as SVGElement).style.willChange="transform");await pause(500);
  const box=(await canvas.boundingBox())!,origin={x:box.x+box.width*.5,y:box.y+box.height*.5};
  await canvas.evaluate(svg=>{
   const metrics={frames:[] as number[],mutations:0,compositionMutations:0,active:true,frame(t:number){this.frames.push(t);if(this.active)requestAnimationFrame(t=>this.frame(t));}};
   (window as unknown as {__diagnosis:typeof metrics}).__diagnosis=metrics;
   requestAnimationFrame(t=>metrics.frame(t));
   new MutationObserver(records=>{metrics.mutations+=records.length;metrics.compositionMutations+=records.filter(r=>(r.target as Element).closest?.('[data-atlas-composition]')).length;}).observe(svg,{subtree:true,childList:true,attributes:true});
  });
  await cdp.send("Profiler.enable");await cdp.send("Profiler.start");
  if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...origin,id:0}]});else{await page.mouse.move(origin.x,origin.y);await page.mouse.down();}
  const panWindowStart=await page.evaluate(()=>performance.now()),start=performance.now(),pending:Promise<unknown>[]=[];
  for(let i=0;i<100;i++){const p={x:origin.x+Math.sin(i/99*Math.PI*2)*Math.min(90,box.width*.15),y:origin.y+Math.sin(i/99*Math.PI*4)*15};pending.push(touch?cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...p,id:0}]}):page.mouse.move(p.x,p.y));await pause(Math.max(0,start+(i+1)*50-performance.now()));}
  await Promise.all(pending);const elapsedMs=performance.now()-start;if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});else await page.mouse.up();
  const pan=await page.evaluate(start=>{const m=(window as unknown as {__diagnosis:{active:boolean;frames:number[];mutations:number;compositionMutations:number}}).__diagnosis;m.active=false;return {...m,frames:m.frames.filter(t=>t>=start&&t<start+5000).length};},panWindowStart);
  await writeFile(path.join(output,"pan.cpuprofile"),JSON.stringify((await cdp.send("Profiler.stop")).profile));console.log(JSON.stringify({phase:"pan",width,height,rate,touch,elapsedMs,...pan}));
  if(process.argv.includes("--pan-only")){await writeFile(path.join(output,"results.json"),JSON.stringify({diagnosticOnly:true,sharedMaskProbe:process.argv.includes("--shared-mask"),source:process.env.SERRIAN_UX0A_CHECKOUT??"runtime-checkout",promoted:process.argv.includes("--promote"),browser:browser.version(),device:{width,height,rate,touch},gpuDevices:hardware.gpu.devices,pan:{...pan,elapsedMs,fps:pan.frames/5}},null,2));await context.close();return;}
  await page.waitForLoadState("networkidle");await page.waitForFunction(()=>!document.querySelector('[data-terrain-cache-ready="false"],[data-artwork-display-ready="false"]'),undefined,{timeout:90000});await pause(500);
  if(process.argv.includes("--brush")){
   await openStudioSection(page,"Artwork");await page.getByRole("button",{name:"Paint broadleaf grove",exact:true}).click();if(await dismiss.isVisible())await dismiss.click();
   if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...origin,id:0}]});
   const brushStart=performance.now();for(let i=0;i<100;i++){const point={x:origin.x-40+i*.8,y:origin.y+Math.sin(i*.2)*12};if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...point,id:0}]});else await page.mouse.move(point.x,point.y);await pause(Math.max(0,brushStart+(i+1)*50-performance.now()));}
   if(touch){await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await page.getByRole("button",{name:/^(Undo|Undo change)$/}).click();}
  }
  const cacheStates=await canvas.locator('[data-terrain-cache-ready]').evaluateAll(nodes=>nodes.map(node=>({id:node.closest('[data-drawing]')?.getAttribute('data-drawing'),ready:node.getAttribute('data-terrain-cache-ready')})));
  await openStudioSection(page,"Export");
  await page.evaluate((sharedMask:boolean)=>{
   const data={start:0,styles:0,styleMs:0,ctms:0,ctmMs:0,properties:0,propertyMs:0,exportTerrainImages:0,exportImages:{png:0,svg:0},blobs:[] as {type:string;bytes:number;atMs:number}[],canvases:[] as {width:number;height:number;atMs:number;doneMs?:number}[]};data.start=performance.now();
   (window as unknown as {__exportDiagnosis:typeof data}).__exportDiagnosis=data;
   const nativeStyle=window.getComputedStyle;window.getComputedStyle=function(...args){const t=performance.now();const r=nativeStyle.apply(this,args);data.styles++;data.styleMs+=performance.now()-t;return r;};
   const nativeCtm=SVGGraphicsElement.prototype.getCTM;SVGGraphicsElement.prototype.getCTM=function(){const t=performance.now(),r=nativeCtm.call(this);data.ctms++;data.ctmMs+=performance.now()-t;return r;};
   const nativeSerialize=XMLSerializer.prototype.serializeToString;XMLSerializer.prototype.serializeToString=function(root){if(root instanceof SVGSVGElement&&root.querySelector('[data-visible-export]')){if(sharedMask)for(const layer of root.querySelectorAll('g[data-layer="terrain"]')){const children=[...layer.querySelectorAll('[mask],[clip-path]')],first=children[0];if(first)for(const key of ['mask','clip-path']){const value=first.getAttribute(key);if(value)layer.setAttribute(key,value);for(const child of children)child.removeAttribute(key);}}data.exportTerrainImages=root.querySelectorAll('[data-illustrated-terrain] > image').length;const images=[...root.querySelectorAll('image[data-island-source]')];data.exportImages={png:images.filter(image=>image.getAttribute('href')?.startsWith('data:image/png')).length,svg:images.filter(image=>image.getAttribute('href')?.startsWith('data:image/svg')).length};}return nativeSerialize.call(this,root);};
   const nativeProperty=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(...args){const t=performance.now();nativeProperty.apply(this,args);data.properties++;data.propertyMs+=performance.now()-t;};
   const nativeUrl=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob instanceof Blob)data.blobs.push({type:blob.type,bytes:blob.size,atMs:performance.now()-data.start});return nativeUrl.call(this,blob);};
   const nativeBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){const sample={width:this.width,height:this.height,atMs:performance.now()-data.start,doneMs:undefined as number|undefined};data.canvases.push(sample);nativeBlob.call(this,blob=>{sample.doneMs=performance.now()-data.start;callback(blob);},...args);};
  },process.argv.includes("--shared-mask"));

  await cdp.send("Profiler.start");
  const exportStart=performance.now(),download=page.waitForEvent("download",{timeout:60000}).catch(()=>null);await page.getByRole("button",{name:"Download visible map PNG",exact:true}).click({timeout:60000});const png=await download,exportMs=performance.now()-exportStart;
  if(png)await png.saveAs(path.join(output,"visible-map.png"));
  const exportDiagnosis=await page.evaluate(()=>({...(window as unknown as {__exportDiagnosis:object}).__exportDiagnosis,nodes:document.querySelectorAll('[data-visible-export] *').length,text:document.querySelector('[aria-label="Map export"]')?.textContent??document.body.innerText.slice(-3000)}));
  await writeFile(path.join(output,"export.cpuprofile"),JSON.stringify((await cdp.send("Profiler.stop")).profile));
  const result={diagnosticOnly:true,sharedMaskProbe:process.argv.includes("--shared-mask"),source:process.env.SERRIAN_UX0A_CHECKOUT??"runtime-checkout",browser:browser.version(),hardware:{devices:hardware.gpu.devices,featureStatus:hardware.gpu.featureStatus},device:{width,height,rate,touch},fixture:{drawings:100,marks:1500},cacheStates,pan:{...pan,elapsedMs,fps:pan.frames/5},export:{completed:!!png,exportMs,...exportDiagnosis},requests,errors};
  await writeFile(path.join(output,"results.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await context.close();
 }finally{await runtime.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
