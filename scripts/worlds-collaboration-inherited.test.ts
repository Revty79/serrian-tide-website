import assert from "node:assert/strict";
import {writeFile,copyFile,readdir} from "node:fs/promises";
import path from "node:path";
import {withCollaborationResources} from "./worlds-collaboration-resource-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {attachOwnedBrowserApi} from "./worlds-owned-world-api";
withCollaborationResources(async f=>{
 for(const file of await readdir(f.source))if(/\.(json|png|webp)$/.test(file)&&file!=="environment.json")await copyFile(path.join(f.source,file),path.join(f.out,file));
 const mode=process.env.SERRIAN_COLLAB_SUITE??"history";
 if(mode==="history"&&process.env.SERRIAN_HISTORY_FINAL_BROWSER==="1")for(const suffix of ["INTEGRATION","TRANSPORT","COMPARISON","CREATION","FAMILY_CREATION","TERRITORY","CONTEXT","NAVIGATION","CRAFT_PLACEMENT"])process.env[`SERRIAN_HISTORY_${suffix}_BROWSER`]="1";
 if(mode==="stage5"||mode==="town"||mode==="town-core"||mode==="underground"){const inventory=(await f.pool.query("select count(*)::int total,count(*) filter(where native_origin_version_id is null)::int visible from world_town_map where world_id=$1",[f.worldA])).rows[0];console.log("START retained Town database validation");await(await import("./worlds-town-maps-disposable.test")).townMapDatabase(f.regional,inventory.total,inventory.visible);console.log("START retained interior database validation");await(await import("./worlds-building-floors-database")).buildingFloorDatabase(f.regional);}
 if(mode==="underground")await(await import("./worlds-collaboration-underground-fixture")).prepareCurrentUnderground(f.regional);
 if(mode==="narrative")await(await import("./worlds-native-history-narrative-browser")).seedNativeNarrative(f.regional);
 if(mode==="inherited"||mode.startsWith("stage6-"))await(await import("./worlds-native-history-inherited")).seedNativeHistoryInherited(f.regional);
 await withCollaborationBrowser(f,async b=>{
  process.env.SERRIAN_UNDERGROUND_BROWSER="production";
  const receipts:unknown[]=[],errors:string[]=[],groups:string[]=[];attachOwnedBrowserApi(b.browser,b.base,receipts);
  groups.push=(...items:string[])=>{for(const item of items)console.log("PASS retained group",item);return Array.prototype.push.apply(groups,items);};
  const context=await b.login("collab-owner-a"),page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
  if(mode==="history")await(await import("./worlds-history-browser-checks")).historyBrowserChecks({f:f.regional,browser:b.browser,context,page,base:b.base,sourceHash:b.sourceHash});
  else if(mode==="history-craft-placement")await(await import("./worlds-native-history-craft-placement-browser")).nativeCraftPlacementBrowser({f:f.regional,browser:b.browser,context,base:b.base,sourceHash:b.sourceHash});
  else if(mode==="history-tail"){
   const input={f:f.regional,browser:b.browser,context,base:b.base,sourceHash:b.sourceHash};
   await(await import("./worlds-history-territory-browser")).nativeTerritoryBrowser(input);
   await(await import("./worlds-history-context-browser")).nativeContextBrowser(input);
   await(await import("./worlds-native-history-navigation-browser")).nativeNavigationBrowser(input);
   await(await import("./worlds-native-history-craft-placement-browser")).nativeCraftPlacementBrowser(input);
  }
  else if(mode==="family")await(await import("./worlds-history-family-creation-browser")).nativeFamilyCreationBrowser({f:f.regional,browser:b.browser,context,base:b.base,sourceHash:b.sourceHash});
  else if(mode==="narrative")await(await import("./worlds-native-history-narrative-browser")).nativeNarrativeBrowser({f:f.regional,browser:b.browser,context,base:b.base,sourceHash:b.sourceHash});
  else if(mode==="integration")await(await import("./worlds-native-history-navigation-browser")).nativeNavigationBrowser({f:f.regional,browser:b.browser,context,base:b.base,sourceHash:b.sourceHash});
  else if(mode==="hierarchy"){
   await(await import("./worlds-region-hierarchy-browser")).hierarchyBrowser({f:f.regional,browser:b.browser,context,page,base:b.base,errors,groups});
  }
  else if(mode.startsWith("stage6-")){
   const input={f:f.regional,browser:b.browser,context,page,base:b.base};
   if(mode==="stage6-template-performance")await(await import("./worlds-templates-performance")).templatePerformance(input);
   else if(mode==="stage6-template-phone")await(await import("./worlds-templates-phone-browser")).templatePhone(input);
   else if(mode==="stage6-craft-performance"){await page.goto(`${b.base}/worlds/${f.worldA}?tab=history`);await(await import("./worlds-owned-world-api")).claimOwnedWorldPage(page,b.base);await(await import("./worlds-crafts-performance")).craftPerformance(input);}
   else if(mode==="stage6-craft-navigation")await(await import("./worlds-crafts-navigation-browser")).craftNavigationBrowser({f:f.regional,page,base:b.base});
   else if(mode==="stage6-assets")await(await import("./worlds-assets-browser-checks")).assetsBrowserChecks(input);
   else if(mode==="stage6-crafts")await(await import("./worlds-crafts-browser-checks")).craftsBrowserChecks(input);
   else if(mode==="stage6-templates")await(await import("./worlds-templates-browser-checks")).templatesBrowserChecks(input);
   else if(mode==="stage6-advanced")await(await import("./worlds-advanced-browser-checks")).advancedTerrainBrowser(input);
   else if(mode==="stage6-advanced-safety")await(await import("./worlds-advanced-browser-safety")).advancedTerrainSafety(input);
   else assert.fail("Unknown retained Stage 6 family");
  }
  else if(mode==="inherited")await(await import("./worlds-native-history-inherited")).nativeHistoryInheritedBrowser({f:f.regional,browser:b.browser,context,page,base:b.base});
  else if(mode==="underground")await(await import("./worlds-collaboration-underground-browser")).collaborationUndergroundBrowser({f:f.regional,browser:b.browser,context,page,base:b.base,groups});
  else if(mode==="stage5"||mode==="town"||mode==="town-core"){
   process.env.SERRIAN_INTERIOR_FULL="1";
   const input={f:f.regional,browser:b.browser,context,page,base:b.base,groups,errors};
   if(mode==="stage5")await(await import("./worlds-building-floors-browser")).buildingFloorBrowser(input);
   if(mode!=="town-core")await(await import("./worlds-town-wheel-browser")).townWheelBrowser(input);
   if(mode!=="town-core")await(await import("./worlds-town-neighborhood-browser")).townNeighborhoodBrowser(input);
   if(mode!=="town-core")await(await import("./worlds-town-creative-browser")).townCreativeBrowser(input);
   await(await import("./worlds-town-maps-browser")).townMapsBrowser(input);
   await(await import("./worlds-town-maps-http")).townMapHttp(input);
  }else assert.fail("Choose a reviewed inherited suite");
  assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"collaboration-inherited.json"),JSON.stringify({passed:true,mode,sourceHash:b.sourceHash,buildId:b.buildId,groups,receipts,errors,realAuthentication:true,sharedAccess:false},null,2));console.log("PASS collaboration inherited",mode);
 });
}).catch(error=>{console.error(error);process.exitCode=1;});
