/** Test-only adapter for retained owner suites. Every write still uses the real
 * authenticated access endpoint; no application authorization is bypassed. */
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import type {Browser,BrowserContext,Page,APIResponse,Request} from "playwright-core";
import type {WorldEditorProof} from "../src/features/worlds/world-permissions";
import {collaborationPassword} from "./worlds-collaboration-fixture";
/** The retained rendering probes forbid content mutations; lease housekeeping is recorded separately. */
export function isOwnedLeaseProtocol(request:Request,base:string,world:string){
 const url=new URL(request.url());if(request.method()!=="POST"||url.origin!==new URL(base).origin||url.pathname!==`/api/worlds/${world}/access`)return false;
 try{const body=request.postDataJSON() as {action?:unknown}|null;return typeof body?.action==="string"&&["acquire-control","renew-control","release-control"].includes(body.action);}catch{return false;}
}
export function attachOwnedWorldApi(context:BrowserContext,base:string,receipts:unknown[],password=collaborationPassword,routeBareFetch=true){
 const pageProofs=new Map<Page,Map<string,string>>();
 const proofFor=(world:string)=>[...pageProofs.values()].map(values=>values.get(world)).filter((proof):proof is string=>!!proof).sort((a,b)=>JSON.parse(a).fence-JSON.parse(b).fence).at(-1);
 context.on("page",page=>{const proofs=new Map<string,string>();pageProofs.set(page,proofs);page.on("close",()=>pageProofs.delete(page));page.on("request",request=>{const id=new URL(request.url()).pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1],proof=request.headers()["x-world-editor"];if(id&&proof&&JSON.parse(proof).fence!==undefined)proofs.set(id,proof);});if(routeBareFetch)void page.route("**/api/worlds/**",async route=>{const request=route.request(),id=new URL(request.url()).pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1],proof=id?proofs.get(id):undefined;if(proof&&!request.headers()["x-world-editor"])await route.continue({headers:{...request.headers(),"x-world-editor":proof}});else await route.continue();});});
 const api=context.request;
 for(const method of ["get","post","patch","delete","put"] as const){
  const original=api[method].bind(api) as (url:string,options?:Record<string,unknown>)=>Promise<APIResponse>;
  const execute=async(url:string,options:Record<string,unknown>={})=>{
   const target=new URL(url,base);if(target.origin!==base)return original(url,options);
   if(target.pathname==="/api/auth/sign-in/email"&&options.data&&typeof options.data==="object"){
    const data=options.data as {email?:string;password?:string};if(data.email?.endsWith("@example.invalid")&&["Regional-Editing-Only-Password!","Worlds-Test-Only-Password!"].includes(data.password??""))options={...options,data:{...data,password}};
   }
   const world=target.pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1];if(!world||world==="invitations"||target.pathname.endsWith("/access"))return original(url,options);
   if(Object.keys(options.headers as Record<string,string>??{}).some(key=>key.toLowerCase()==="x-world-editor"))return original(url,options);
   const existing=proofFor(world);if(existing)return original(url,{...options,headers:{...options.headers as Record<string,string>,"X-World-Editor":existing}});
   if(method==="get"||target.searchParams.get("review")==="1")return original(url,options);
   const inspect=await originalMethods.get(base+`/api/worlds/${world}/access`);if(inspect.status()!==200||(await inspect.json()).permission.role!=="owner")return original(url,options);
   const proof:WorldEditorProof={clientId:randomUUID(),token:randomBytes(32).toString("hex")},access=base+`/api/worlds/${world}/access`,post=originalMethods.post;
   const acquired=await post(access,{headers:{Origin:base,"X-World-Editor":JSON.stringify(proof)},data:{action:"acquire-control",requestId:randomUUID(),proof}});assert.equal(acquired.status(),200,"Retained-suite setup must deliberately acquire available owner control: "+await acquired.text());proof.fence=(await acquired.json()).access.editor.fence;
   receipts.push({world,action:"bounded setup acquire/write/release",method,path:target.pathname});
   try{return await original(url,{...options,headers:{...options.headers as Record<string,string>,"X-World-Editor":JSON.stringify(proof)}});}finally{const released=await post(access,{headers:{Origin:base},data:{action:"release-control",requestId:randomUUID(),proof}});assert.equal(released.status(),200);}
  };
  api[method]=execute as typeof api[typeof method];
 }
 const originalMethods={post:api.post.bind(api),get:api.get.bind(api)};
 // Capture the unwrapped endpoint method: access calls are excluded above and
 // cannot recursively acquire control.
}
export function attachOwnedBrowserApi(browser:Browser,base:string,receipts:unknown[],password=collaborationPassword,routeBareFetch=true){const original=browser.newContext.bind(browser);browser.newContext=async options=>{const context=await original({...options,extraHTTPHeaders:{"cf-connecting-ip":"198.51.100.220",...options?.extraHTTPHeaders}});attachOwnedWorldApi(context,base,receipts,password,routeBareFetch);return context;};}

/** Explicit public Owner controls for retained tests that intend to edit after
 * a full navigation or in a different tab. Read-only/foreign actors never claim. */
export async function claimOwnedWorldPage(page:Page,base:string){
 const id=new URL(page.url()).pathname.match(/^\/worlds\/([a-f0-9-]{36})$/i)?.[1];if(!id)return;const permission=await page.request.get(`${base}/api/worlds/${id}/access`);if(permission.status()!==200||(await permission.json()).permission.role!=="owner")return;
 if(await page.getByText("Read-only view",{exact:true}).isVisible())return;
 const handle=async(dialog:import("playwright-core").Dialog)=>{await dialog.accept().catch(()=>{});};page.on("dialog",handle);
 let controls:import("playwright-core").Locator|undefined;
 try{
  await page.bringToFront();const native=page.getByRole("button",{name:"Editing control",exact:true});
  for(let i=0;i<await native.count();i++)if(await native.nth(i).isVisible()){await native.nth(i).click();controls=page.getByRole("dialog",{name:"Editing control",exact:true});await controls.waitFor();break;}
  const scope=controls??page,deadline=Date.now()+15000;
  for(;;){
   const [status]=await Promise.all([page.waitForResponse(response=>response.request().method()==="GET"&&new URL(response.url()).pathname===`/api/worlds/${id}/access`),scope.getByRole("button",{name:"Check editing status",exact:true}).click()]);
   const current=await status.json() as {editor:{yours:boolean}};await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   if(current.editor.yours&&await scope.getByText("You are editing",{exact:true}).isVisible())break;
   const reclaim=scope.getByRole("button",{name:"Reclaim control",exact:true}),start=scope.getByRole("button",{name:"Start editing",exact:true});
   const action=await reclaim.isVisible()?reclaim:await start.isVisible()?start:undefined;
   if(action)try{await action.click({timeout:1000});}catch(error){if(!(error instanceof Error)||error.name!=="TimeoutError")throw error;}

   assert.ok(Date.now()<deadline,"Owner editing control must be explicitly confirmed through the public UI");await page.waitForTimeout(100);
  }
 }finally{if(controls&&await controls.isVisible())await controls.getByRole("button",{name:"Back to map",exact:true}).click();page.off("dialog",handle);}

}
