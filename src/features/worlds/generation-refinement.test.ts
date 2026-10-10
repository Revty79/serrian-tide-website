import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { signedArea, polygonCenter, validateMapDraft } from "./atlas";
import { generateMap } from "./map-generator";
import { presetSpec } from "./generation-spec";
import { descriptionExample, interpretDescription, validateDescriptionSpec } from "./description-interpreter";
import { bounds } from "./generation-geometry";

const equivalent=(value:unknown)=>JSON.stringify(value,(key,v)=>key==="id"||key==="geographyId"?undefined:v);
test("the published v1 arrangements and description recipe reproduce unchanged",()=>{
  const receipts={continental:"4bc6219c0f70864ea09c680a95c476065082166c5d755696fb8399504713cc0c",northern:"8e5254102fbfa9a9a45a6354454736b7fb422ba23fc1cb1f9fac1a45e8d9afec",archipelago:"2248ba3314c07a2f6d9c5878d94f551838dea0988c1f0070438c564746f6cecd",description:"983d0215a58a1d73319c7524a10843474f7bd679344a7fdf145e087dc6481bca"};
  for(const [preset,hash] of Object.entries(receipts)){
    const base={...presetSpec(preset==="description"?"continental":preset as "continental"|"northern"|"archipelago","frozen-v1"),algorithm:"serrian-atlas-v1" as const};
    const spec=preset==="description"?interpretDescription(descriptionExample,base):base;
    assert.equal(createHash("sha256").update(equivalent(generateMap(spec))).digest("hex"),hash);
    assert.equal(spec.algorithm,"serrian-atlas-v1");
  }
});
test("natural worlds have unequal land areas and irregular centers rather than repeated rows",()=>{
  for(let n=0;n<6;n++){
    const spec=presetSpec("continental",`refinement-world-${n}`),a=generateMap(spec),b=generateMap(spec);
    assert.equal(equivalent(a),equivalent(b));validateMapDraft(a.draft);
    const land=a.draft.features.slice(0,3).map(f=>{assert.equal(f.geometry.type,"polygon");if(f.geometry.type!=="polygon")throw new Error("No polygon");return f.geometry.points;});
    const areas=land.map(p=>Math.abs(signedArea(p)));assert.ok(Math.max(...areas)/Math.min(...areas)>1.5);
    const centers=land.map(polygonCenter);assert.ok(new Set(centers.map(p=>Math.round(p.y/30))).size>=2);
  }
});
test("archipelagos keep exact island counts, large size variation and broken woodland edges",()=>{
  const spec=presetSpec("archipelago","refinement-acceptance-2026"),result=generateMap(spec);
  const areas=result.draft.features.map(f=>{if(f.geometry.type!=="polygon")throw new Error("No polygon");return Math.abs(signedArea(f.geometry.points));});
  assert.equal(areas.length,28);assert.ok(Math.max(...areas)/Math.min(...areas)>8);
  const forests=result.draft.drawings!.filter(d=>d.type==="terrain"&&d.kind==="forest");
  assert.ok(forests.some(d=>d.type==="terrain"&&d.density===1&&d.name.endsWith("fringe")));
  assert.ok(forests.some(d=>d.type==="terrain"&&d.density>1));
  const lakes=result.draft.drawings!.filter(d=>d.type==="terrain"&&d.kind==="lake");assert.equal(lakes.length,2);
});
test("the same reviewed description benefits from v2 while keeping its counts, regions and orientation",()=>{
  const base=presetSpec("continental","description-example-2026"),spec=interpretDescription(descriptionExample,base);validateDescriptionSpec(spec);
  const refined=generateMap(spec),original=generateMap({...spec,algorithm:"serrian-atlas-v1"});
  assert.notEqual(equivalent(refined),equivalent(original));
  assert.equal(refined.stats.continents,1);assert.equal(refined.stats.islands,3);
  const main=refined.draft.features[0];if(main.geometry.type!=="polygon")throw new Error("No polygon");const b=bounds(main.geometry.points);
  assert.ok(b.y+b.height/2<600);
  for(const island of refined.draft.features.slice(1)){if(island.geometry.type!=="polygon")throw new Error("No polygon");assert.ok(bounds(island.geometry.points).x>b.x+b.width);}
  const range=refined.draft.drawings!.find(d=>d.type==="terrain"&&d.kind==="mountains");assert.ok(range&&range.type==="terrain");const r=bounds(range.points);assert.ok(r.height>r.width);
  assert.deepEqual(spec.interpretation,interpretDescription(descriptionExample,{...base,algorithm:"serrian-atlas-v1"}).interpretation);
});
