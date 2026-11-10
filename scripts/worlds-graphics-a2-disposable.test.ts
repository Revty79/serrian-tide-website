/** New owned fixture only. Never loads .env or connects to shared DEV. */
import path from "node:path";
import {withRegionalEditingFixture} from "./worlds-regional-editing-fixture";
import {createGraphicsA2Fixture} from "./worlds-graphics-a2-fixture";
import {runGraphicsA2Browser} from "./worlds-graphics-a2-browser";
import {prepareGraphicsA2Runtime} from "./worlds-graphics-a2-build";
process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??="artifacts/regions-s43-graphics-a2-current-1";
withRegionalEditingFixture(async f=>{
 const fixture=await createGraphicsA2Fixture(f);
 const runtime=await prepareGraphicsA2Runtime(f.databaseUrl);
 await runGraphicsA2Browser(f,fixture,{phase:"candidate",checkout:path.resolve(runtime.checkout),dist:runtime.dist,sourceHash:runtime.sourceHash,out:process.env.SERRIAN_A2_OUT??"artifacts/atlas-graphics-a2/current-1"});
}).catch(error=>{console.error(error);process.exitCode=1;});
