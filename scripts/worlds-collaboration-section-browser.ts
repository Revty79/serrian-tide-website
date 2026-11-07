import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {BrowserContext} from "playwright-core";
import type {CollaborationFixture} from "./worlds-collaboration-fixture";
import type {CollaborationBrowser} from "./worlds-collaboration-browser-fixture";

/** Actual invited Player navigation, complementing the direct scoped API matrix. */
export async function sharedSectionBrowser(f:CollaborationFixture,b:CollaborationBrowser,context:BrowserContext){
 const page=await context.newPage(),errors:string[]=[],requests:{url:string;status:number}[]=[],checks:unknown[]=[];
 page.on("pageerror",error=>errors.push(error.message));
 page.on("response",response=>{if(response.url().includes(`/api/worlds/${f.worldA}`)&&response.status()>=400)requests.push({url:response.url(),status:response.status()});});
 const sections=[
  ["overview","Overview",null],["history","History",null],["chronology","Chronology",null],["calendars","Calendars","Invited calendar"],["timelines","Timelines",null],
  ["peoples","Peoples","Invited matrix species"],["individuals","Individuals","Invited matrix individual"],["politics","Politics","Invited matrix government"],
  ["organizations","Organizations","Invited matrix organization"],["cosmology","Cosmology","Invited matrix cosmicFramework"],["stories","Lore, Stories & Legends","Invited matrix story"],
  ["towns","Towns","Invited settlement"],["campaigns","Campaigns",null],
 ] as const;
 try{
  await page.goto(`${b.base}/worlds/${f.worldA}?tab=overview&timeline=${f.timelineA}`);
  const navigation=page.getByRole("navigation",{name:"World workspace",exact:true});await navigation.waitFor();
  for(const [tab,label,record]of sections){
   await navigation.getByRole("button",{name:label==="History"?/^History\s*\d*$/:label,exact:label!=="History"}).click();
   await page.waitForURL(url=>url.searchParams.get("tab")===tab);await page.waitForLoadState("networkidle");
   assert.equal(await navigation.getByRole("button",{name:label==="History"?/^History\s*\d*$/:label,exact:label!=="History"}).getAttribute("aria-current"),"page");
   if(tab==="towns"){
    await page.getByRole("navigation",{name:"Town list",exact:true}).getByRole("button",{name:/^Invited settlement\s*·/}).click();
    await page.getByRole("heading",{name:record!,exact:true}).waitFor();
   }else if(record)await page.getByText(record,{exact:true}).first().waitFor();
   const mutations=page.getByRole("button",{name:/^(?:Create .+|New entry|New era|Edit identity|New record|New calendar|Add Town|Add association|Manage access|Reclaim control)$/});
   for(let i=0;i<await mutations.count();i++)assert.ok(!await mutations.nth(i).isVisible()||await mutations.nth(i).isDisabled(),`${tab} must not offer Viewer mutation controls`);
   assert.ok(!(await page.locator("body").innerText()).includes("Private creator note"));checks.push({tab,actualInvitedPlayerNavigation:true,recordRead:record,mutationsUnavailable:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await page.screenshot({path:path.join(f.out,"shared-viewer-sections.png")});
  await writeFile(path.join(f.out,"shared-viewer-sections.json"),JSON.stringify({passed:true,checks,errors,requests,sourceHash:b.sourceHash,buildId:b.buildId,realAuthentication:true,sharedAccess:false},null,2));
 }catch(error){await page.screenshot({path:path.join(f.out,"shared-viewer-sections-failure.png")}).catch(()=>{});await writeFile(path.join(f.out,"shared-viewer-sections-failure.txt"),await page.locator("body").innerText());throw error;}finally{await page.close();}
}
