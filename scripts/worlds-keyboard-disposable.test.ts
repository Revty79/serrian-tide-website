/** Stage A1 owns its database, storage, application and browser. Never loads owner .env files. */
import path from "node:path";
import {withRegionalEditingFixture} from "./worlds-regional-editing-fixture";
import {regionalEditingBrowser} from "./worlds-regional-editing-browser-checks";
process.env.SERRIAN_KEYBOARD_PASS="1";
process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??="artifacts/regions-s43-keyboard-a1-1";
process.env.SERRIAN_REGIONAL_EDIT_CHECKOUT??=path.resolve("artifacts/atlas-keyboard-1/runtime");
process.env.SERRIAN_REGIONAL_EDIT_BROWSER??="production";
process.env.SERRIAN_REGIONAL_EDIT_DIST??=".next-keyboard-a1";
process.env.SERRIAN_REGIONAL_EDIT_REUSE_BUILD??="1";
withRegionalEditingFixture(async f=>{
 const terrain=await import("../src/features/worlds/terrain-service");
 await terrain.changeTerrain("world-god",f.world,{action:"create",requestId:"a1000000-0000-4000-8000-000000000001",name:"A1 blank wrapping terrain",initial:"land",settings:{widthKm:12.8,heightKm:3.2,gridWidth:64,gridHeight:32,wrap:true,minElevation:-12000,maxElevation:12000}});
 // Existing fixture authors all synthetic geography in its owned database only.
 await regionalEditingBrowser(f);
}).catch(error=>{console.error(error);process.exitCode=1;});
