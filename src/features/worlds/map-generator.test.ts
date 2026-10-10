import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { validateMapDraft } from "./atlas";
import { generateMap } from "./map-generator";
import { bounds, edgeDistance, inside, bezierSamples, separated } from "./generation-geometry";
import { generationSpecSchema, presetSpec, presets, type Preset } from "./generation-spec";

function equivalent<T>(value:T) {return JSON.parse(JSON.stringify(value, (key, v)=>key==="id"||key==="geographyId"?undefined:v));}
test("generator reproduces arrangements while new creations receive independent ordinary identities",()=>{
  const spec=presetSpec("northern","serrian-north-42"),a=generateMap(spec,randomUUID),b=generateMap(spec,randomUUID);
  assert.deepEqual(equivalent(a),equivalent(b));assert.notEqual(a.draft.features[0].id,b.draft.features[0].id);assert.notEqual(a.draft.geographies[0].id,b.draft.geographies[0].id);
  assert.notDeepEqual(equivalent(a),equivalent(generateMap({...spec,seed:"serrian-north-43"},randomUUID)));
  assert.equal(a.draft.features[0].geometry.type,"polygon");assert.equal(a.draft.geographies[0].kind,"continent");assert.ok(a.draft.drawings!.some(d=>d.type==="path"));
});
test("distinct presets and seeds stay within editor limits with separated land and connected coastal rivers",()=>{
  for(const preset of Object.keys(presets) as Preset[])for(let n=0;n<5;n++){
    const spec=presetSpec(preset,`quality-${n}`),result=generateMap(spec,randomUUID),draft=result.draft;validateMapDraft(draft);
    assert.equal(draft.features.length,spec.settings.continents+spec.settings.islands);assert.ok(result.stats.terrainMarks<=6000);
    const polygons=draft.features.map(f=>{assert.equal(f.geometry.type,"polygon");if(f.geometry.type!=="polygon")throw new Error("Generated a special geometry.");return f.geometry.points;});
    for(let i=0;i<polygons.length;i++)for(let j=i+1;j<polygons.length;j++)assert.ok(separated(polygons[i],polygons[j],0),`${preset}/${n}: land overlaps`);
    const rivers=draft.drawings!.filter(d=>d.type==="path");assert.equal(rivers.length,spec.settings.rivers);
    for(const river of rivers){const home=polygons.find(p=>inside(river.points[0],p))!;assert.ok(home,"River starts on land.");assert.ok(edgeDistance(river.points.at(-1)!,home)<.1,"River reaches an actual coastline.");assert.ok(bezierSamples(river.points,river.curve).every(p=>inside(p,home)||edgeDistance(p,home)<=1),"Rendered river follows land, not ocean.");}
    assert.equal(draft.drawings!.filter(d=>d.type==="terrain"&&d.kind==="lake").length,spec.settings.lakes);
    assert.ok(draft.drawings!.filter(d=>d.type==="terrain").every(d=>d.geographyId===null));
  }
});
test("northern placement and regional terrain are reflected by generated editable source",()=>{
  const spec=presetSpec("northern","northern-placement"),result=generateMap(spec,randomUUID),continent=result.draft.features[0];
  if(continent.geometry.type!=="polygon")throw new Error("No editable continent.");const b=bounds(continent.geometry.points);assert.ok(b.y+b.height/2<600);
  for(const drawing of result.draft.drawings!.filter(d=>d.type==="terrain"&&d.kind==="forest"&&d.name.startsWith(result.draft.geographies[0].name))){assert.equal(drawing.type,"terrain");if(drawing.type!=="terrain")continue;assert.ok(drawing.points.reduce((sum,p)=>sum+p.y,0)/drawing.points.length>b.y+b.height*.5);}
  const range=result.draft.drawings!.find(d=>d.type==="terrain"&&d.kind==="mountains")!;if(range.type!=="terrain")throw new Error("No range.");const r=bounds(range.points);assert.ok(r.height>r.width,"Requested north-south ranges are vertical.");
});
test("invalid settings and unsupported metadata fail before generation",()=>{
  const spec=presetSpec("continental","limits");
  for(const bad of [{...spec,seed:""},{...spec,settings:{...spec.settings,continents:999}},{...spec,settings:{...spec.settings,islands:33}},{...spec,algorithm:"unversioned"},{...spec,description:"unreviewed"}])assert.equal(generationSpecSchema.safeParse(bad).success,false);
  assert.throws(()=>generateMap({...spec,settings:{...spec.settings,mapType:"continent",continents:2}},randomUUID),/exactly one/);
});
