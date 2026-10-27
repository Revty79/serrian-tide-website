import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import type {checkHydrologyBrowser} from "./worlds-hydrology-browser-checks";
import {waterPhoto,waterReady} from "./worlds-hydrology-browser-checks";
import {terrainPanel} from "./worlds-terrain-browser-ui";

async function checkMatchedWaterViews({god,base,world,out,errors}:Parameters<typeof checkHydrologyBrowser>[0]){
  const fixture=JSON.parse(await readFile(`${out}/natural-fixture.json`,"utf8")),p=await god.newPage();p.setDefaultTimeout(120000);p.on("pageerror",e=>errors.push(e.message));
  try{
    await p.goto(`${base}/worlds/${world}?tab=atlas&terrainMap=${fixture.mapId}`);const c=p.getByLabel("Terrain map canvas",{exact:true});await c.waitFor();await p.getByRole("button",{name:"Expand editor",exact:true}).click();await terrainPanel(p,"Water");await waterReady(p);
    for(const style of ["realistic-terrain","illustrated-fantasy","topographic","physical-relief","classic-elevation"]){await terrainPanel(p,"World");await p.getByLabel("Map Appearance",{exact:true}).selectOption(style);await waterReady(p);await waterPhoto(p,out,`matched-${style}`);}
    const started=performance.now();await c.focus();for(let i=0;i<5;i++){await p.keyboard.press("ArrowRight");await p.keyboard.press("ArrowLeft");}const navigationMs=performance.now()-started;
    assert.deepEqual(errors,[]);await writeFile(`${out}/natural-matched.json`,JSON.stringify({passed:true,baseline:true,...fixture,navigationTenKeysMs:navigationMs,gpuDisabled:true,physicalDevice:false},null,2)+"\n");
  }finally{await p.close();}
}

export async function checkNaturalBrowser(options:Parameters<typeof checkHydrologyBrowser>[0]){
  if(process.env.SERRIAN_NATURAL_ONLY!=="1")await (await import("./worlds-water-browser-checks")).checkWaterBrowser(options);
  await checkMatchedWaterViews(options);
  if(process.env.SERRIAN_NATURAL_DISPLAY_ONLY==="1")return;
  await (await import("./worlds-natural-workflows")).checkNaturalWorkflows(options);
  await (await import("./worlds-natural-devices")).checkNaturalDevices(options);
  await (await import("./worlds-natural-performance")).checkNaturalPerformance(options);
  await (await import("./worlds-natural-precision")).checkNaturalPrecision(options);
}
