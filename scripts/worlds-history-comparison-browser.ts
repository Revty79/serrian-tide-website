import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {Browser,BrowserContext,Page} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeMapComparison} from "../src/features/worlds/native-map-history-comparison";

export async function nativeComparisonBrowser({f,browser,context,base,sourceHash}:{f:RegionalFixture;browser:Browser;context:BrowserContext;base:string;sourceHash:string}){
  const map=(await f.pool.query("select id from world_atlas_map where world_id=$1 and name='Historical numerical World'",[f.world])).rows[0].id;
  const receipts:unknown[]=[],errors:string[]=[],failures:string[]=[];
  const watch=(page:Page)=>{page.on("pageerror",error=>errors.push(error.message));page.on("response",response=>{if(/\/api\/worlds\//.test(response.url())&&response.status()>=400)failures.push(`${response.status()} ${new URL(response.url()).pathname}`);});};
  const versions=async()=>(await f.pool.query("select count(*)::int n from world_map_state_version")).rows[0].n,before=await versions();
  for(const size of [{width:1440,height:1000},{width:390,height:844}]){
    const mobile=size.width===390,layout=mobile?"phone":"desktop",owned=await browser.newContext({storageState:await context.storageState(),viewport:size,hasTouch:mobile}),page=await owned.newPage();watch(page);owned.on("page",watch);page.on("dialog",dialog=>void dialog.accept());
    try{
      await page.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${map}&atlasYear=100&atlasEditing=1`,{waitUntil:"networkidle"});
      const canvas=page.getByLabel("Terrain map canvas",{exact:true});await canvas.waitFor();assert.ok((await canvas.boundingBox())!.height>=400);await canvas.evaluate(node=>{(node as HTMLElement).dataset.comparisonIdentity="preserve this mounted editor";});
      const history=page.getByRole("button",{name:"History / Era",exact:true});for(let i=0;i<await history.count();i++)if(await history.nth(i).isVisible()){await history.nth(i).click();break;}
      const dialog=page.getByRole("dialog",{name:"History / Era",exact:true});await dialog.getByText("Historical conditions",{exact:true}).click();await dialog.getByLabel("Historical condition object",{exact:true}).selectOption(map);await dialog.getByLabel("Historical condition account",{exact:true}).fill(`Unsaved ${layout} account retained during comparison`);
      const panel=dialog.getByLabel("Compare historical map sources",{exact:true});await panel.locator("summary").first().click();await panel.getByLabel("Left year",{exact:true}).fill("100");await panel.getByLabel("Right year",{exact:true}).fill("500");
      const capture=()=>page.evaluate(()=>{const event=new CustomEvent<{view?:{x:number;y:number;scale:number}}>("atlas:capture-view",{detail:{}});dispatchEvent(event);return event.detail.view;});
      const view=await capture(),scroll=await page.evaluate(()=>scrollY);
      async function compare(){const response=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/worlds/${f.world}/atlas-history/compare`);await panel.getByRole("button",{name:"Compare Selected Sources",exact:true}).click();const accepted=await response;assert.equal(accepted.status(),200,await accepted.text());const result=await accepted.json() as NativeMapComparison;await panel.getByRole("heading",{name:"Right: "+result.right.label,exact:true}).waitFor();return result;}
      const dated=await compare();assert.equal(dated.numeric.points.length,64);assert.ok(dated.numeric.points.some(point=>point.difference!==0));assert.equal(await page.evaluate(()=>scrollY),scroll);assert.equal(await canvas.getAttribute("data-comparison-identity"),"preserve this mounted editor");assert.deepEqual(await capture(),view);assert.equal(await dialog.getByLabel("Historical condition account",{exact:true}).inputValue(),`Unsaved ${layout} account retained during comparison`);
      assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1),"Historical comparison controls and tables must fit the dialog width");
      await page.screenshot({path:path.join(f.out,`historical-comparison-${layout}.png`)});
      await panel.getByLabel("Right year",{exact:true}).fill("300");const unknown=await compare();assert.equal(unknown.right.coverage,"unknown");assert.equal(unknown.numeric.points.length,0);
      await panel.getByLabel("Right source kind",{exact:true}).selectOption("baseline");const baseline=await compare();assert.equal(baseline.right.coverage,"current-reference");
      for(const side of ["Left","Right"]){
        const link=panel.getByRole("link",{name:`Open ${side} Source`,exact:true}),href=new URL((await link.getAttribute("href"))!,base),expected=JSON.parse(href.searchParams.get("atlasView")!) as {x:number;y:number;scale:number};
        const [source]=await Promise.all([owned.waitForEvent("page"),link.click()]);watch(source);
        try{
          await source.waitForLoadState("networkidle");assert.equal(source.viewportSize()?.width,size.width);const sourceCanvas=source.getByLabel("Terrain map canvas",{exact:true});await sourceCanvas.waitFor();assert.ok((await sourceCanvas.boundingBox())!.height>=400);
          const captureSource=()=>source.evaluate(()=>{const event=new CustomEvent<{view?:{x:number;y:number;scale:number}}>("atlas:capture-view",{detail:{}});dispatchEvent(event);return event.detail.view;});let actual=await captureSource();
          for(let i=0;i<20&&(!actual||Math.abs(actual.x-expected.x)>1e-7||Math.abs(actual.y-expected.y)>1e-7||Math.abs(actual.scale-expected.scale)>1e-9);i++){await source.waitForTimeout(100);actual=await captureSource();}
          assert.ok(actual);assert.ok(Math.abs(actual.x-expected.x)<1e-7&&Math.abs(actual.y-expected.y)<1e-7&&Math.abs(actual.scale-expected.scale)<1e-9);
        }finally{await source.close();}
      }
      assert.equal(await dialog.getByLabel("Historical condition account",{exact:true}).inputValue(),`Unsaved ${layout} account retained during comparison`);assert.equal(await canvas.getAttribute("data-comparison-identity"),"preserve this mounted editor");await dialog.getByRole("button",{name:"Cancel Condition Details",exact:true}).click();
      receipts.push({layout,matchedSamples:64,unknownRemainsUnknown:true,baselineUndatedReference:true,originalUnsubmittedDraftAndMountedEditorAndCameraRetained:true,bothRealSourceTabsSameCameraAndViewport:true});
    }catch(error){await page.screenshot({path:path.join(f.out,`historical-comparison-${layout}-failure.png`)}).catch(()=>{});await writeFile(path.join(f.out,`historical-comparison-${layout}-failure.txt`),await page.locator("body").innerText().catch(()=>""));throw error;}
    finally{await owned.close();}
  }
  assert.equal(await versions(),before);assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  await writeFile(path.join(f.out,"historical-comparison-browser.json"),JSON.stringify({passed:true,sourceHash,receipts,noSavedMapVersionWrites:true,clientErrors:errors,requestFailures:failures,sharedDatabaseAccess:false},null,2));
}
