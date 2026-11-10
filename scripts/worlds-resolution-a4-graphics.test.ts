/** Original A2 rendering checks on new synthetic data and the exact A4 build. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {withRegionalEditingFixture} from "./worlds-regional-editing-fixture";
import {createGraphicsA2Fixture} from "./worlds-graphics-a2-fixture";
import {runGraphicsA2Browser} from "./worlds-graphics-a2-browser";
process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??="artifacts/regions-s43-resolution-a4-graphics-1";
withRegionalEditingFixture(async f=>{
 const runtime=JSON.parse(await readFile(process.env.SERRIAN_A4_RUNTIME_RECEIPT??"artifacts/atlas-resolution-a4/build-5/results.json","utf8"));assert(runtime.passed);const fixture=await createGraphicsA2Fixture(f);
 await runGraphicsA2Browser(f,fixture,{phase:"candidate",checkout:runtime.checkout,dist:runtime.dist,sourceHash:runtime.sourceHash,out:process.env.SERRIAN_A4_GRAPHICS_OUT??"artifacts/atlas-graphics-a2/a4-regression-1"});
}).catch(error=>{console.error(error);process.exitCode=1;});
