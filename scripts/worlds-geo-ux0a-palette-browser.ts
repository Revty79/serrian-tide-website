/** Actual website palette/city proof using the retained three-subject catalog only. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownedPool, UX0A_DIRECTORY } from "./worlds-geo-ux0a-harness";
import { islandRuntime } from "./worlds-geo-ux0a-runtime";

async function main(){
  const runtime=await islandRuntime("empty","palette-browser"),{e,browser,login}=runtime,context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});await login(context);
  const page=await context.newPage(),dir="docs/screenshots/worlds-geo-ux0a/palette",errors:string[]=[],run=String(Date.now()).slice(-5),cityName=`Lantern harbor ${run}`,newName=`Lantern haven ${run}`,outsideName=`Offshore city ${run}`;
  await mkdir(dir,{recursive:true});page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
  try{
    const baseline=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"journey-baseline.json"),"utf8"));await page.goto(baseline.mapUrl);await page.getByRole("button",{name:"Atlas",exact:true}).click();await page.getByRole("button",{name:"Open Website land mask proof",exact:true}).click();
    const canvas=page.getByRole("application",{name:"Editable map canvas"});await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});
    const position=(x:number,y:number)=>canvas.evaluate((node,p)=>{const a=new DOMPoint(p.x,p.y).matrixTransform((node as SVGSVGElement).getScreenCTM()!);return{x:a.x,y:a.y};},{x,y});
    const tap=async(x:number,y:number)=>{const p=await position(x,y);await page.mouse.click(p.x,p.y);};
    const save=async()=>{const [response]=await Promise.all([page.waitForResponse(r=>r.url().includes("/atlas")&&r.request().method()==="POST"),page.getByRole("button",{name:"Save map",exact:true}).click()]);assert.equal(response.status(),200);await page.getByRole("status").filter({hasText:"Map saved."}).waitFor();};
    await page.getByLabel("Find an illustration",{exact:true}).fill("forest");await page.waitForFunction(()=>{const img=document.querySelector<HTMLImageElement>('[aria-label="Illustration palette"] img');return !!img?.complete&&img.naturalWidth>0;});await page.getByRole("button",{name:"Paint broadleaf grove",exact:true}).click();
    await page.getByLabel("Brush size",{exact:true}).fill("65");await page.getByLabel("Mark spacing",{exact:true}).fill("90");await page.getByLabel("Brush density",{exact:true}).fill("1");await page.getByLabel("Pattern seed",{exact:true}).fill("947");
    const start=await position(1050,420),end=await position(1340,550);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:20});await page.mouse.up();
    await canvas.locator("[data-illustrated-terrain]").last().waitFor({state:"attached"});
    await page.getByLabel("Drawing name",{exact:true}).fill(`Illustrated grove ${run}`);await page.getByLabel("Stroke pattern seed",{exact:true}).fill("117");await page.getByRole("button",{name:"Apply drawing changes",exact:true}).click();
    const beforeCity=await canvas.locator("[data-drawing]").count();
    await page.getByLabel("Find an illustration",{exact:true}).fill("city");await page.getByRole("button",{name:"Place city",exact:true}).click();await page.getByLabel("City name",{exact:true}).fill(cityName);
    const pointer=await position(1200,900);await page.mouse.move(pointer.x,pointer.y);assert.ok(await canvas.locator('[data-export-omit] use[href*="cursor-"]').count());await tap(1200,900);
    assert.equal(await page.getByRole("dialog").count(),0);assert.equal(await canvas.locator("[data-drawing]").count(),beforeCity+2);
    await page.getByRole("button",{name:/^(Undo|Undo change)$/}).click();assert.equal(await canvas.locator("[data-drawing]").count(),beforeCity);await page.getByRole("button",{name:/^(Redo|Redo change)$/}).click();assert.equal(await canvas.locator("[data-drawing]").count(),beforeCity+2);await save();
    await page.getByRole("button",{name:cityName,exact:true}).click();await page.getByLabel("Linked geography name",{exact:true}).fill(newName);await page.getByRole("button",{name:"Apply linked geography",exact:true}).click();assert.equal(await canvas.locator("text").filter({hasText:newName}).count(),1);await save();
    await page.getByRole("button",{name:"Place city",exact:true}).click();await page.getByLabel("City name",{exact:true}).fill(outsideName);await tap(100,100);
    await page.getByRole("dialog",{name:"Place this city outside known land?",exact:true}).waitFor();await page.getByRole("button",{name:"Choose another position",exact:true}).click();assert.equal(await canvas.locator("[data-drawing]").count(),beforeCity+2);
    await tap(100,100);await page.getByRole("button",{name:"Place here anyway",exact:true}).click();assert.equal(await canvas.locator("[data-drawing]").count(),beforeCity+4);await save();
    await page.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/desktop-city-palette.png`});
    const check=await ownedPool(e,"empty");let persisted:Record<string,unknown>;
    try{const rows=(await check.query("select d.id,d.geography_id,d.content,g.name,g.context from world_atlas_drawing d join world_geography g on g.id=d.geography_id where d.content->>'name'=$1",[cityName])).rows;assert.equal(rows.length,1);const city=rows[0];assert.equal(city.content.version,2);assert.equal(city.content.assetRef.assetRevision,1);assert.equal(city.name,newName);assert.equal(city.context,"settlement");
      const labels=(await check.query("select id,content from world_atlas_drawing where geography_id=$1 and content->>'type'='label'",[city.geography_id])).rows;assert.equal(labels.length,1);assert.equal(labels[0].content.text,newName);
      const grove=(await check.query("select content from world_atlas_drawing where content->>'name'=$1",[`Illustrated grove ${run}`])).rows[0].content;assert.equal(grove.version,2);assert.equal(grove.seed,117);assert.equal(grove.assetRefs[0].assetId,"woodland-broadleaf-grove");
      persisted={cityId:city.id,placeId:city.geography_id,labelId:labels[0].id,assetRef:city.content.assetRef,grove};
    }finally{await check.end();}
    await page.getByRole("button",{name:"Map library",exact:true}).click();await page.reload();await page.getByRole("button",{name:"Open Website land mask proof",exact:true}).click();await canvas.locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});assert.equal(await canvas.locator("text").filter({hasText:newName}).count(),1);
    await page.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/reopened-city-palette.png`});assert.deepEqual(errors,[]);
    await writeFile(path.join(UX0A_DIRECTORY,"palette-browser-results.json"),JSON.stringify({passed:true,browser:browser.version(),scope:"Current three-subject catalog; no art promotion/full-library or full UX-0A readiness",groups:["search/lazy thumbnail/palette paint","exact v2 source/seed editing","city preview and atomic undo/redo with label","same persistent place rename and default label","outside-land cancellation/explicit placement","save/close/reload/reopen"],persisted,errors},null,2));console.log("PASS actual palette, city identity/label, outside-land confirmation, undo and reopen");
  }catch(error){await page.screenshot({path:path.join(UX0A_DIRECTORY,"palette-browser-failure.png"),fullPage:true});await writeFile(path.join(UX0A_DIRECTORY,"palette-browser-state.txt"),await page.locator("body").innerText());throw error;}
  finally{await runtime.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
