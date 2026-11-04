import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {geographyTemplateEnvironment} from "./map-template-geography";
import {environmentCoverage,validateEnvironmentFrame} from "./terrain-environment";
import {terrainSourceSchema,presetRecipe} from "./terrain-source";
test("native geographic coverage fits wrapped/unwrapped Worlds and retains source descriptors without numerical samples",()=>{
 for(const wrap of [false,true])for(const kind of ["woodland","arid","wetland","alpine","volcanic"] as const){const world={width:100000,height:60000,wrap},preset={kind,id:randomUUID()},layer=geographyTemplateEnvironment(preset,world);validateEnvironmentFrame(layer,world);assert.equal(layer.fields.length,0);assert.equal(new Set(layer.regions.map(r=>r.id)).size,layer.regions.length);for(const x of [1000,30000,70000,99000])assert.ok(layer.regions.some(r=>environmentCoverage(r,x,30000,world)>.9));const source=terrainSourceSchema.parse({kind:"generated",recipe:presetRecipe("island"),templateEnvironment:preset});assert.equal(source.kind==="generated"&&source.templateEnvironment?.id,preset.id);assert.ok(!JSON.stringify(source).includes('"samples"'));}
});
test("an existing-map regeneration cannot carry a hidden whole-World coverage replacement",()=>{assert.equal(terrainSourceSchema.safeParse({kind:"regenerated",recipe:presetRecipe("continent"),preserveManual:true,feather:8,area:{x:0,y:0,width:32,height:32},templateEnvironment:{kind:"arid",id:randomUUID()}}).success,false);});
