import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {builtInMapTemplates} from "./map-template-catalogue";
import {resolveTemplate,portableTemplate,templateContentSchema,validateTemplate,type TemplateContent} from "./map-templates";
import {emptyFloor,roomFeatures} from "./building-floor";
import {defaultTownGeneration,emptyTownDesign,townFeature} from "./town-map";
import {makeTownStamp,defaultTownBrush} from "./town-map-presets";
import {floorFootprint,validateFloor} from "./building-floor";
import {buildingFloorAlignment,alignedFloorDesign,alignedFloorAngle} from "./building-floor-alignment";
import {appendFloorTemplate} from "./map-template-application";

const context={fit:false,includeDecks:true,seed:"repeatable creator preview"};
test("every curated template resolves through native editable models within their unchanged budgets",()=>{
 assert.equal(builtInMapTemplates.length,50);assert.equal(new Set(builtInMapTemplates.map(t=>t.id)).size,50);
 for(const t of builtInMapTemplates){templateContentSchema.parse(t.content);const result=resolveTemplate(t.content,context,randomUUID);validateTemplate(result);assert.equal(result.family,t.family);assert.ok(t.attribution&&t.description&&t.artwork.length);}
});
test("a multideck template has independently sized native decks and no geographic placement or live returns",()=>{
 const c=resolveTemplate(builtInMapTemplates.find(t=>t.id==="atlas-template:craft:sailing")!.content,context,randomUUID);assert.equal(c.family,"craft");if(c.family!=="craft"||!c.drawing)throw Error("craft drawing missing");
 assert.equal(c.drawing.decks.length,3);assert.equal(new Set(c.drawing.decks.map(d=>d.frame.width)).size,3);
 const surfaces=[c.drawing.draft,...c.drawing.decks],ids=surfaces.flatMap(d=>d.surface.plan.features.map(f=>f.id));assert.equal(new Set(ids).size,ids.length);assert.ok(!JSON.stringify(c).includes('"destination":{'));
 const noDecks=resolveTemplate(c,{...context,includeDecks:false},randomUUID);assert.equal(noDecks.family==="craft"?noDecks.drawing?.decks.length:-1,0);
});
test("separate instantiations have new feature/corner identities and leave the reusable source exact",()=>{
 const original=builtInMapTemplates.find(t=>t.id==="atlas-template:interior:inn")!.content,bytes=JSON.stringify(original),a=resolveTemplate(original,context,randomUUID),b=resolveTemplate(original,context,randomUUID);
 assert.equal(a.family,"interior");assert.equal(b.family,"interior");if(a.family!=="interior"||b.family!=="interior")return;const ids=new Set(a.drawing!.design.features.map(f=>f.id));assert.ok(b.drawing!.design.features.every(f=>!ids.has(f.id)));assert.equal(JSON.stringify(original),bytes);
});
test("portable Town templates remove permanent Place and Shop links and retain the source drawing",()=>{
 const design=emptyTownDesign(),f=townFeature("building","area",[{x:5,y:5},{x:15,y:5},{x:15,y:15},{x:5,y:15}],randomUUID());f.placeId=randomUUID();f.shopLocationId=randomUUID();design.features.push(f);const c:TemplateContent={family:"town",settings:defaultTownGeneration(),drawing:{frame:{x:200,y:300,width:100,height:100,rotation:35},design},images:[]},bytes=JSON.stringify(c),copy=portableTemplate(c,randomUUID);
 assert.equal(copy.family,"town");if(copy.family!=="town")return;assert.equal(copy.drawing!.frame.x,0);assert.equal(copy.drawing!.design.features[0].placeId,null);assert.equal(copy.drawing!.design.features[0].shopLocationId,null);assert.notEqual(copy.drawing!.design.features[0].id,f.id);assert.equal(JSON.stringify(c),bytes);
});
test("portable floor copies remap attached walls/openings and strip live floor destinations",()=>{
 const frame={x:0,y:0,width:30,height:20,rotation:0},design=emptyFloor();design.features=roomFeatures([{x:1,y:1},{x:29,y:1},{x:29,y:19},{x:1,y:19}],randomUUID);const id=randomUUID();design.features.push({version:1,id,entityId:id,kind:"transition",variant:"object",name:"Stair",archived:false,point:{x:10,y:10},width:1,height:2,rotation:0,symbol:"stairs",destination:{floorId:randomUUID(),point:{x:10,y:10}}});
 const c=portableTemplate({family:"interior",recipe:{purpose:"inn",rooms:3,flooring:"boards"},drawing:{frame,design},images:[]},randomUUID);validateTemplate(c);assert.equal(c.family==="interior"&&c.drawing?.design.features.find(f=>f.variant==="object")?.destination,null);
});
test("fitting is deliberate, scales native geometry and pinned images, and preserves asset/version identity",()=>{
 const frame={x:0,y:0,width:30,height:20,rotation:0},design=emptyFloor();design.features=roomFeatures([{x:1,y:1},{x:29,y:1},{x:29,y:19},{x:1,y:19}],randomUUID);const assetId=randomUUID(),c:TemplateContent={family:"interior",recipe:{purpose:"house",rooms:3,flooring:"boards"},drawing:{frame,design},images:[{surface:0,layer:{version:1,placements:[{id:randomUUID(),assetId,version:3,name:"Private reference",x:15,y:10,width:20,height:10,rotation:0,opacity:.4,flipX:false,flipY:false,visible:true,locked:true,tier:"reference"}]}}]};
 assert.throws(()=>resolveTemplate(c,{...context,frame:{...frame,width:15,height:10}},randomUUID),/Fit drawing/);const copy=resolveTemplate(c,{...context,fit:true,frame:{...frame,width:15,height:10}},randomUUID);validateTemplate(copy);assert.equal(copy.images[0].layer.placements[0].assetId,assetId);assert.equal(copy.images[0].layer.placements[0].version,3);assert.equal(copy.images[0].layer.placements[0].x,7.5);assert.equal(c.images[0].layer.placements[0].x,15);
});
test("invalid image surfaces and malformed geometry cannot enter a reusable template",()=>{
 const c=resolveTemplate(builtInMapTemplates.find(t=>t.id==="atlas-template:interior:house")!.content,context,randomUUID);assert.throws(()=>validateTemplate({...c,images:[{surface:8,layer:{version:1,placements:[]}}]}),/retained template drawing/);
 if(c.family!=="interior")return;const wrong=structuredClone(c);const f=wrong.drawing!.design.features.find(f=>f.variant==="area")!;if(f.variant==="area")f.points[0].x=-1;assert.throws(()=>validateTemplate(wrong));
});
test("Inn starts use native rooms and real attached doors in an angled building's accepted working grid",()=>{
 const house=makeTownStamp("building",{x:100,y:100},{...defaultTownBrush(),category:"house",rotation:30},randomUUID()),building=floorFootprint(house),c=resolveTemplate(builtInMapTemplates.find(t=>t.id==="atlas-template:interior:inn")!.content,{...context,frame:building.frame,footprint:building.points},randomUUID);
 assert.equal(c.family,"interior");if(c.family!=="interior")return;validateFloor(c.drawing!.design,building.frame);assert.ok(c.drawing!.design.features.filter(f=>f.variant==="opening").length>=2);
 const aligned=alignedFloorDesign(c.drawing!.design,buildingFloorAlignment(building.points,building.frame));for(const f of aligned.features.filter(f=>f.variant==="wall"&&f.roomId)){if(f.variant!=="wall")continue;for(let i=1;i<f.points.length;i++)assert.ok(Math.abs(f.points[i].x-f.points[i-1].x)<.04||Math.abs(f.points[i].y-f.points[i-1].y)<.04);}
});
test("adding a template preserves every current object and rejects locked target layers",()=>{
 const c=resolveTemplate(builtInMapTemplates.find(t=>t.id==="atlas-template:interior:house")!.content,context,randomUUID);if(c.family!=="interior")throw Error("interior");const current=emptyFloor(),frame=c.drawing!.frame,original=JSON.stringify(current),copy=appendFloorTemplate(current,c.drawing!.design,frame);assert.equal(JSON.stringify(current),original);assert.ok(copy.features.length);const locked={...current,layers:{...current.layers,rooms:{visible:true,locked:true}}};assert.throws(()=>appendFloorTemplate(locked,c.drawing!.design,frame),/Unlock/);
});
test("personal interiors retain their working-grid directions when reused in a differently angled building",()=>{
 const from=floorFootprint(makeTownStamp("building",{x:100,y:100},{...defaultTownBrush(),category:"house",rotation:30},randomUUID())),to=floorFootprint(makeTownStamp("building",{x:100,y:100},{...defaultTownBrush(),category:"house",rotation:-15},randomUUID())),source=resolveTemplate(builtInMapTemplates.find(t=>t.id==="atlas-template:interior:inn")!.content,{...context,frame:from.frame,footprint:from.points},randomUUID),before=JSON.stringify(source),copy=resolveTemplate(source,{...context,fit:true,frame:to.frame,footprint:to.points},randomUUID);if(copy.family!=="interior")throw Error();const shown=alignedFloorDesign(copy.drawing!.design,buildingFloorAlignment(to.points,to.frame));for(const f of shown.features){if(f.variant!=="wall"||!f.roomId)continue;for(let i=1;i<f.points.length;i++)assert.ok(Math.abs(f.points[i].x-f.points[i-1].x)<.05||Math.abs(f.points[i].y-f.points[i-1].y)<.05,"Copied rooms must remain square to the destination working grid");}assert.equal(JSON.stringify(source),before);validateFloor(copy.drawing!.design,to.frame);
});
test("angled interior reuse keeps image pins and same-building physical geometry without round-trip drift",()=>{
 const from=floorFootprint(makeTownStamp("building",{x:100,y:100},{...defaultTownBrush(),category:"house",rotation:30},randomUUID())),to=floorFootprint(makeTownStamp("building",{x:100,y:100},{...defaultTownBrush(),category:"house",rotation:-15},randomUUID())),source=resolveTemplate(builtInMapTemplates.find(t=>t.id==="atlas-template:interior:inn")!.content,{...context,frame:from.frame,footprint:from.points},randomUUID);if(source.family!=="interior")throw Error();const a=buildingFloorAlignment(from.points,from.frame),assetId=randomUUID();source.images=[{surface:0,layer:{version:1,placements:[{id:randomUUID(),assetId,version:2,name:"Grid-aligned private reference",x:from.frame.width/2,y:from.frame.height/2,width:2,height:1,rotation:a.angle+12,opacity:.5,flipX:false,flipY:false,visible:true,locked:false,tier:"reference"}]}}];const original=JSON.stringify(source),same=resolveTemplate(source,{...context,frame:from.frame,footprint:from.points},randomUUID);if(same.family!=="interior")throw Error();const geometry=(d:typeof source.drawing)=>d!.design.features.map(f=>"points" in f?f.points.map(p=>({x:p.x,y:p.y})):f.variant==="object"?{point:f.point,width:f.width,height:f.height,rotation:f.rotation}:{at:f.at,width:f.width});assert.deepEqual(geometry(same.drawing),geometry(source.drawing));const pin=same.images[0].layer.placements[0];assert.equal(pin.x,source.images[0].layer.placements[0].x);assert.equal(pin.y,source.images[0].layer.placements[0].y);const copied=resolveTemplate(source,{...context,fit:true,frame:to.frame,footprint:to.points},randomUUID),dest=copied.images[0].layer.placements[0];assert.equal(dest.assetId,assetId);assert.equal(dest.version,2);assert.ok(Math.abs(alignedFloorAngle(dest.rotation,buildingFloorAlignment(to.points,to.frame))-12)<.03);assert.equal(JSON.stringify(source),original);validateTemplate(copied);
});
