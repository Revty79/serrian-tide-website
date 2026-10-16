/** Reopen the website-created palette proof; inspect export, touch controls and read-only Admin access. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownedPool, UX0A_DIRECTORY } from "./worlds-geo-ux0a-harness";
import { islandRuntime } from "./worlds-geo-ux0a-runtime";

async function main(){
  const runtime=await islandRuntime("empty","palette-view"),{e,browser,login}=runtime,dir="docs/screenshots/worlds-geo-ux0a/palette";await mkdir(dir,{recursive:true});
  const fixture=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"palette-browser-results.json"),"utf8")),baseline=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"journey-baseline.json"),"utf8"));
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});await login(context);const page=await context.newPage(),errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  try{
    await page.goto(baseline.mapUrl);await page.getByRole("button",{name:"Atlas",exact:true}).click();await page.getByRole("button",{name:"Open Website land mask proof",exact:true}).click();
    const canvas=page.getByRole("application",{name:"Editable map canvas"});await canvas.locator(`[data-drawing="${fixture.persisted.cityId}"] use`).waitFor({state:"attached"});
    // Correct the earlier proof's edge label through its ordinary editable point controls.
    const edgePool=await ownedPool(e,"empty");let edge:{content:{name:string;point:{x:number;y:number};text:string}}|undefined;
    try{edge=(await edgePool.query("select d.content from world_atlas_drawing d where d.map_id=(select map_id from world_atlas_drawing where id=$1) and d.content->>'type'='label' and d.content->>'text' like 'Offshore city %' order by d.sort_order desc limit 1",[fixture.persisted.cityId])).rows[0];}finally{await edgePool.end();}
    if(edge&&edge.content.point.x<Math.min(950,edge.content.text.length*9+12)){await page.getByRole("button",{name:edge.content.name,exact:true}).click();await page.getByLabel("Drawing X",{exact:true}).fill(String(Math.min(950,edge.content.text.length*9+12)));await page.getByRole("button",{name:"Apply drawing position",exact:true}).click();await page.getByRole("button",{name:"Save map",exact:true}).click();await page.getByRole("status").filter({hasText:"Map saved."}).waitFor();}
    await page.getByLabel("Find an illustration",{exact:true}).fill("city");await page.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/desktop-city-palette.png`});
    await page.getByRole("navigation",{name:"Studio tools"}).getByRole("button",{name:"Export",exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Download visible map PNG",exact:true}).click()]);await download.saveAs(`${dir}/city-palette-visible.png`);
    await page.reload();await canvas.locator(`[data-drawing="${fixture.persisted.cityId}"] use`).waitFor({state:"attached"});await page.getByLabel("Find an illustration",{exact:true}).fill("city");await page.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/reopened-city-palette.png`});
    const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});await login(phone);const mobile=await phone.newPage();mobile.on("pageerror",error=>errors.push(error.message));await mobile.goto(page.url());
    await mobile.getByRole("application",{name:"Editable map canvas"}).locator(`[data-drawing="${fixture.persisted.cityId}"] use`).waitFor({state:"attached"});
    await mobile.getByLabel("Illustration family",{exact:true}).selectOption("Woodland");await mobile.getByLabel("Find an illustration",{exact:true}).fill("city");await mobile.getByText("No illustrations match. Try another name or choose All families.",{exact:true}).waitFor();
    await mobile.getByLabel("Illustration family",{exact:true}).selectOption("");await mobile.getByRole("button",{name:"Place city",exact:true}).tap();await mobile.getByLabel("City name",{exact:true}).fill("Retained placement settings");
    await mobile.getByRole("navigation",{name:"Studio tools"}).getByRole("button",{name:"Layers",exact:true}).tap();await mobile.getByRole("navigation",{name:"Studio tools"}).getByRole("button",{name:"Artwork",exact:true}).tap();
    assert.equal(await mobile.getByLabel("City name",{exact:true}).inputValue(),"Retained placement settings");assert.equal(await mobile.getByLabel("Find an illustration",{exact:true}).inputValue(),"city");await mobile.getByLabel("City name",{exact:true}).scrollIntoViewIfNeeded();
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await mobile.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/touch-browser-city-controls.png`});
    const admin=await browser.newContext({viewport:{width:1440,height:900}});await login(admin,e.users.admin);const review=await admin.newPage();review.on("pageerror",error=>errors.push(error.message));const reviewUrl=new URL(baseline.mapUrl);reviewUrl.searchParams.set("review","1");await review.goto(reviewUrl.href);await review.getByRole("button",{name:"Atlas",exact:true}).click();await review.getByRole("button",{name:"Open Website land mask proof",exact:true}).click();await review.getByText("This map is read-only in the current context.",{exact:true}).waitFor();assert.equal(await review.getByRole("button",{name:"Place city",exact:true}).isDisabled(),true);
    const pool=await ownedPool(e,"empty");try{const row=(await pool.query("select d.geography_id,d.content,g.name from world_atlas_drawing d join world_geography g on g.id=d.geography_id where d.id=$1",[fixture.persisted.cityId])).rows[0];assert.equal(row.geography_id,fixture.persisted.placeId);assert.deepEqual(row.content.assetRef,fixture.persisted.assetRef);}finally{await pool.end();}
    assert.deepEqual(errors,[]);await writeFile(path.join(UX0A_DIRECTORY,"palette-view-results.json"),JSON.stringify({passed:true,groups:["actual visible PNG after city/label rename","390px native-touch palette search/family/placement settings survive panel switch","Admin explicit review can read but cannot place artwork","reopened city keeps exact place and asset identities"],browser:browser.version(),physicalDevice:false,errors},null,2));console.log("PASS palette PNG, touch controls and read-only Admin review");
    await phone.close();await admin.close();
  }catch(error){await page.screenshot({path:path.join(UX0A_DIRECTORY,"palette-view-failure.png"),fullPage:true});throw error;}finally{await runtime.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
