/** Behavior checks for needless cache churn and pointer-layout work; owned fixture only. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"library-performance-current.json"),"utf8"));
 const runtime=await islandRuntime("empty","performance-regressions",f.environment),results=[];
 const output=path.join(UX0A_DIRECTORY,"performance-investigation",process.env.SERRIAN_UX0A_CHECKOUT??"runtime-checkout");await mkdir(output,{recursive:true});
 try{
  for(const touch of [false,true]){
   const c=await runtime.browser.newContext({viewport:touch?{width:390,height:844}:{width:1024,height:768},hasTouch:touch,isMobile:touch});await runtime.login(c);const p=await c.newPage(),cdp=await c.newCDPSession(p),errors:string[]=[],writes:string[]=[];
   p.on("pageerror",e=>errors.push(e.message));p.on("request",r=>{if(r.method()!=="GET"&&r.url().includes('/api/worlds/'))writes.push(new URL(r.url()).pathname);});
   const before=await c.request.get(`${runtime.base}/api/worlds/${f.world}/atlas`);assert.equal(before.status(),200);const savedBefore=await before.json();
   await p.goto(`${runtime.base}/worlds/${f.world}?tab=atlas&timeline=${f.timeline}&editMap=${f.map}`);const canvas=p.getByRole("application",{name:"Editable map canvas"});await canvas.waitFor();
   const ready=async()=>{await p.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached",timeout:90000});await p.waitForFunction(()=>!document.querySelector('[data-terrain-cache-ready="false"],[data-artwork-display-ready="false"]'),undefined,{timeout:90000});};await ready();
   await canvas.evaluate(svg=>{const nodes=[...svg.querySelectorAll('[data-terrain-raster]')];(window as unknown as {__retained:{nodes:Element[];urls:(string|null)[]}}).__retained={nodes,urls:nodes.map(node=>node.getAttribute('href'))};});
   await p.getByRole("button",{name:"Items",exact:true}).click();await p.getByRole("button",{name:"Items",exact:true}).click();await p.getByRole("button",{name:"Move map (Pan)",exact:true}).click();await ready();
   const cache=await canvas.evaluate(svg=>{const before=(window as unknown as {__retained:{nodes:Element[];urls:(string|null)[]}}).__retained,after=[...svg.querySelectorAll('[data-terrain-raster]')];return {count:before.nodes.length,retained:before.nodes.length>0&&before.nodes.length===after.length&&before.nodes.every((node,i)=>node===after[i]&&before.urls[i]===after[i].getAttribute('href'))};});
   const box=(await canvas.boundingBox())!,origin={x:box.x+box.width/2,y:box.y+box.height/2};
   await canvas.evaluate(svg=>svg.addEventListener("pointerdown",e=>{(window as unknown as {__activePointer:number}).__activePointer=(e as PointerEvent).pointerId;},{once:true}));
   if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...origin,id:0}]});else{await p.mouse.move(origin.x,origin.y);await p.mouse.down();}
   await canvas.evaluate(svg=>{
    const count={ctmReads:0};(window as unknown as {__pointerCost:typeof count}).__pointerCost=count;
    const original=(svg as SVGSVGElement).getScreenCTM;(svg as SVGSVGElement).getScreenCTM=function(){count.ctmReads++;return original.call(this);};
   });
   for(let i=0;i<12;i++){const point={x:origin.x+10+i,y:origin.y+5};if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...point,id:0}]});else await p.mouse.move(point.x,point.y);await pause(30);}
   const pointer=await canvas.evaluate(svg=>({...(window as unknown as {__pointerCost:{ctmReads:number}}).__pointerCost,preview:svg.querySelector(':scope > g')?.getAttribute('transform')}));
   await p.setViewportSize(touch?{width:360,height:800}:{width:960,height:800});await pause(100);
   const moved={x:origin.x+30,y:origin.y+10};if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...moved,id:0}]});else await p.mouse.move(moved.x,moved.y);await pause(100);
   const resize=await canvas.evaluate((svg,delta)=>{const matrix=(svg as SVGSVGElement).getScreenCTM()!,transform=svg.querySelector(':scope > g')?.getAttribute('transform'),actual=transform?.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/);return {transform,correct:!!actual&&Math.abs(Number(actual[1])-delta.x/matrix.a)<.1&&Math.abs(Number(actual[2])-delta.y/matrix.d)<.1};},{x:30,y:10});
   // A real canceled captured pointer must restore the view without committing a source edit.
   const pointerId=await p.evaluate(()=>(window as unknown as {__activePointer:number}).__activePointer);await canvas.dispatchEvent("pointercancel",{pointerId,pointerType:touch?"touch":"mouse",isPrimary:true,button:0});
   if(touch)await cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});else await p.mouse.up();await pause(100);
   const cleared=await canvas.evaluate(svg=>!svg.querySelector(':scope > g')?.getAttribute('transform'));
   const after=await c.request.get(`${runtime.base}/api/worlds/${f.world}/atlas`);assert.equal(after.status(),200);const savedExact=JSON.stringify(await after.json())===JSON.stringify(savedBefore);
   const result={touch,cache,pointer,resize,previewCleared:cleared,savedExact,writes,errors,passed:cache.retained&&pointer.ctmReads===0&&!!pointer.preview&&resize.correct&&cleared&&savedExact&&!writes.length&&!errors.length};results.push(result);console.log(JSON.stringify(result));await c.close();
  }
  const c=await runtime.browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await runtime.login(c);const p=await c.newPage(),cdp=await c.newCDPSession(p),errors:string[]=[],writes:string[]=[];p.on("pageerror",e=>errors.push(e.message));p.on("request",r=>{if(r.method()!=="GET"&&r.url().includes('/api/worlds/'))writes.push(new URL(r.url()).pathname);});
  await p.goto(`${runtime.base}/worlds/${f.world}?tab=atlas&timeline=${f.timeline}&atlas=${f.map}`);const explorer=p.getByLabel("Explorable geographic map",{exact:true});await explorer.waitFor();await p.waitForFunction(()=>document.querySelector('[aria-label="Explorable geographic map"]')?.getAttribute('data-geographic-atlas')==='true');await explorer.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});await explorer.scrollIntoViewIfNeeded();
  const box=(await explorer.boundingBox())!,a={x:box.x+box.width*.4,y:box.y+box.height*.5,id:0},b={x:box.x+box.width*.6,y:box.y+box.height*.5,id:1},sourceBefore=await explorer.locator('[data-geographic-land-mask] path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')));
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[a,b]});await p.setViewportSize({width:360,height:800});await pause(100);await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...a,x:a.x+15,y:a.y+6},{...b,x:b.x+15,y:b.y+6}]});await pause(100);
  const resize=await explorer.evaluate(svg=>{const matrix=(svg as SVGSVGElement).getScreenCTM()!,transform=svg.querySelector(':scope > g')?.getAttribute('transform'),actual=transform?.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/);return {transform,correct:!!actual&&Math.abs(Number(actual[1])-15/matrix.a)<.1&&Math.abs(Number(actual[2])-6/matrix.d)<.1};});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});await pause(100);const cleared=await explorer.evaluate(svg=>!svg.querySelector(':scope > g')?.getAttribute('transform')),sourceExact=JSON.stringify(await explorer.locator('[data-geographic-land-mask] path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d'))))===JSON.stringify(sourceBefore),explorerResize={resize,previewCleared:cleared,sourceExact,writes,errors,passed:resize.correct&&cleared&&sourceExact&&!writes.length&&!errors.length};await c.close();
  const report={runtimeFingerprint:runtime.fingerprint,passed:results.every(r=>r.passed)&&explorerResize.passed,runtime:process.env.SERRIAN_UX0A_CHECKOUT??"runtime-checkout",physicalDevice:false,results,explorerResize};await writeFile(path.join(output,"regressions.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({explorerResize}));assert.equal(report.passed,true);
 }finally{await runtime.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
