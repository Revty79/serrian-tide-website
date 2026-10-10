import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { descriptionExample, interpretDescription, validateDescriptionSpec } from "./description-interpreter";
import { presetSpec } from "./generation-spec";
import { generateMap } from "./map-generator";
import { bounds, edgeDistance, inside } from "./generation-geometry";

test("the example resolves count, northern land, western bays, central range, southern woods and eastern islands/outlet",()=>{
  const spec=interpretDescription(descriptionExample,presetSpec("continental","description-example-2026"));
  assert.equal(spec.settings.continents,1);assert.equal(spec.settings.islands,3);assert.equal(spec.settings.size,"large");assert.equal(spec.settings.forest,85);assert.equal(spec.settings.rivers,1);
  assert.deepEqual([spec.plan.landPosition,spec.plan.ruggedCoast,spec.plan.baySide,spec.plan.bays,spec.plan.bayDepth,spec.plan.additionalBaySide],["north","west","west",3,3,"east"]);
  assert.deepEqual([spec.plan.mountainOrientation,spec.plan.mountainRegion,spec.plan.forestRegion,spec.plan.islandPosition,spec.plan.riverDirection],["north-south","center","south","east","east"]);
  assert.equal(spec.interpretation!.warnings.length,1);assert.match(spec.interpretation!.warnings[0],/width/);validateDescriptionSpec(spec);
  const result=generateMap(spec,randomUUID),main=result.draft.features[0].geometry;if(main.type!=="polygon")throw new Error("Not editable land.");const b=bounds(main.points);assert.ok(b.y+b.height/2<600);
  for(const f of result.draft.features.slice(1)){if(f.geometry.type!=="polygon")throw new Error("Not editable islands.");assert.ok(bounds(f.geometry.points).x>b.x+b.width);}
  const name=result.draft.geographies[0].name,drawings=result.draft.drawings!,range=drawings.find(d=>d.type==="terrain"&&d.kind==="mountains"&&d.name.startsWith(name))!;if(range.type!=="terrain")throw new Error("No range.");assert.ok(bounds(range.points).height>bounds(range.points).width);
  for(const f of drawings.filter(d=>d.type==="terrain"&&d.kind==="forest"&&d.name.startsWith(name))){if(f.type!=="terrain")continue;assert.ok(f.points.reduce((sum,p)=>sum+p.y,0)/f.points.length>b.y+b.height*.5);}
  const river=drawings.find(d=>d.type==="path")!;if(river.type!=="path")throw new Error("No river.");assert.ok(inside(river.points[0],main.points));assert.ok(edgeDistance(river.points.at(-1)!,main.points)<.1);assert.ok(river.points.at(-1)!.x>b.x+b.width*.55);
});

test("diagonal regions, directional ranges, terrain, climate and bounded counts are documented actual settings",()=>{
  const spec=interpretDescription("One medium continent in the southwest. Two mountain ranges run northeast to southwest in the center. Sparse forests in the northeast. Two lakes in the west. Desert in the east. Grasslands in the south. Wetlands in the west. Snow in the north. A cold climate. Parchment style.",presetSpec("northern","vocabulary"));
  assert.equal(spec.plan.landPosition,"southwest");assert.equal(spec.plan.mountainOrientation,"northeast-southwest");assert.equal(spec.plan.mountainRanges,2);assert.equal(spec.plan.forestRegion,"northeast");assert.equal(spec.settings.forest,30);assert.equal(spec.plan.lakeRegion,"west");assert.equal(spec.settings.lakes,2);assert.equal(spec.settings.biome,"northern");assert.deepEqual(spec.plan.extraTerrain,["desert","grassland","wetland","snow"]);assert.equal(spec.interpretation!.warnings.length,0);validateDescriptionSpec(spec);
});

test("island-only archipelagos, positive negation and zero counts retain strict native settings",()=>{
  const base=presetSpec("continental","island-language"),spec=interpretDescription("No continents. 28 islands in the southeast. No mountains. No forests. Zero rivers. Zero lakes.",base);
  assert.equal(spec.settings.continents,0);assert.equal(spec.settings.islands,28);assert.equal(spec.settings.mountains,0);assert.equal(spec.settings.forest,0);assert.equal(spec.settings.rivers,0);assert.equal(spec.settings.lakes,0);assert.equal(spec.plan.islandPosition,"southeast");validateDescriptionSpec(spec);
  assert.throws(()=>interpretDescription("Twenty-eight islands.",base),/Use digits/);assert.throws(()=>interpretDescription("-1 continent.",base),/whole numbers/);assert.throws(()=>interpretDescription("1.5 continents.",base),/whole numbers/);
});

test("unsupported and ambiguous major details remain visible rather than silently presented as understood",()=>{
  const spec=interpretDescription("One continent. Forests in the north and south. A river into a lake. A volcano and two cities. A large lake. One continent with a desert in its east.",presetSpec("continental","unsupported"));
  assert.ok(spec.interpretation!.warnings.some(w=>w.includes("opposite region")));assert.ok(spec.interpretation!.warnings.some(w=>w.includes("Lake-fed")));assert.ok(spec.interpretation!.warnings.some(w=>w.includes("volcano")));assert.ok(spec.interpretation!.warnings.some(w=>w.includes("cities")));assert.ok(spec.interpretation!.warnings.some(w=>w.includes("lake size")));assert.ok(spec.interpretation!.warnings.some(w=>w.includes("not applied: desert")));validateDescriptionSpec(spec);
  assert.equal(spec.plan.landPosition,"center","An unsupported secondary desert position does not reposition its continent.");
  const source=interpretDescription("A river from northern mountains.",presetSpec("continental","source-limit"));assert.equal(source.plan.riverDirection,"automatic","A source direction is not falsely used as the outlet.");assert.ok(source.interpretation!.warnings.some(w=>w.includes("Directional river-source")));validateDescriptionSpec(source);
});

test("conflicts have repeatable reviewed outcomes; untouched seeds/styles remain explicit",()=>{
  const spec=interpretDescription("Two continents. One large continent in the north. One small continent in the south. Four islands.",presetSpec("continental","conflicts"));assert.equal(spec.settings.continents,1);assert.equal(spec.settings.size,"small");assert.equal(spec.plan.landPosition,"south");assert.ok(spec.interpretation!.warnings.some(w=>w.includes("Conflicting")));assert.equal(spec.seed,"conflicts");validateDescriptionSpec(spec);
  assert.deepEqual(interpretDescription(descriptionExample,spec).plan,interpretDescription(descriptionExample,presetSpec("northern","different-seed")).plan);
});

test("invalid/excessive text/counts and forged descriptions or interpretation claims fail explicitly",()=>{
  const base=presetSpec("continental","limits");for(const raw of ["","x".repeat(4001),"99 continents.","33 islands.","13 rivers.","Eleven lakes.","Volcanoes and cities.",Array.from({length:49},()=>"One continent.").join(" ")])assert.throws(()=>interpretDescription(raw,base));
  const spec=interpretDescription(descriptionExample,base);assert.throws(()=>validateDescriptionSpec({...spec,plan:{...spec.plan,forestRegion:"north"}}),/do not match/);assert.throws(()=>validateDescriptionSpec({...spec,interpretation:{...spec.interpretation!,warnings:[]}}),/do not match/);
});
