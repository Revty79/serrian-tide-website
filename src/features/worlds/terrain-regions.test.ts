import assert from "node:assert/strict";
import {test} from "node:test";
import {regionCreateSchema,regionDraftSchema,regionContainsFrame,regionContainsPoint,regionOverlaps,validateRegionFrame,terrainSourceState,advanceTerrainSourceState} from "./terrain-regions";
import {clipTerrainRegion,regionalTownCaption} from "./terrain-region-view";
const world={displayWidth:1e9,displayHeight:5e8,wrap:true};
test("regional requests preserve canonical physical bounds and reject extra authority",()=>{
  const command={action:"create-region",requestId:crypto.randomUUID(),parentMapId:crypto.randomUUID(),terrainId:crypto.randomUUID(),parentRevision:1,sourceRevision:4,sourceState:"4;",name:"North",frame:{x:999999900,y:2e8,width:200,height:100}};
  assert.deepEqual(regionCreateSchema.parse(command),command);validateRegionFrame(command.frame,world);
  assert.equal(regionCreateSchema.safeParse({...command,tiles:[]}).success,false);
  assert.equal(regionCreateSchema.safeParse({...command,frame:{...command.frame,width:Infinity}}).success,false);
});
test("wrapped coverage includes the same physical points and nested numerical frames on either seam side",()=>{
  const region={x:999999900,y:100,width:200,height:1000};
  assert.ok(regionContainsPoint(region,{x:999999950,y:120},world));assert.ok(regionContainsPoint(region,{x:50,y:120},world));
  assert.ok(!regionContainsPoint(region,{x:101,y:120},world));assert.ok(regionContainsFrame(region,{x:999999980,y:200,width:40,height:100},world));
  assert.ok(!regionContainsFrame(region,{x:50,y:200,width:100,height:100},world));
  assert.ok(regionOverlaps(region,{x:0,y:200,width:200,height:100},world));
});
test("fixed edges and requested extents reject rather than silently resize",()=>{
  for(const frame of [{x:0,y:0,width:1e9+1,height:100},{x:10,y:5e8-50,width:100,height:100},{x:1e9,y:0,width:100,height:100}])assert.throws(()=>validateRegionFrame(frame,world));
  assert.throws(()=>validateRegionFrame({x:999999900,y:0,width:200,height:100},{...world,wrap:false}));
  validateRegionFrame({x:0,y:0,width:1,height:5e8},world);
});
test("recovery retains editable invalid bounds without admitting them as accepted geography",()=>{
 const draft={name:"Retained proposal",frame:{x:-20,y:100,width:0,height:500}};
 assert.deepEqual(regionDraftSchema.parse(JSON.parse(JSON.stringify(draft))),draft);
 assert.throws(()=>validateRegionFrame(draft.frame,world));
 assert.equal(regionDraftSchema.safeParse({...draft,frame:{...draft.frame,width:"500"}}).success,false);
});
test("adjacent and overlapping regional presentations need no duplicate terrain",()=>{
  const a={x:100,y:100,width:1000,height:200},b={x:1100,y:100,width:1000,height:200},c={x:500,y:100,width:1000,height:200};
  assert.ok(!regionOverlaps(a,b,world));assert.ok(regionOverlaps(a,c,world));
  assert.ok(regionContainsPoint(a,{x:700,y:120},world)&&regionContainsPoint(c,{x:700,y:120},world));
});
test("source vectors are order-independent and change for every accepted numerical head",()=>{
 const rows=[{id:"b",revision:2},{id:"a",revision:3}];
 const pin=terrainSourceState(4,rows);assert.equal(pin,terrainSourceState(4,[...rows].reverse()));
 assert.notEqual(pin,terrainSourceState(5,rows));assert.notEqual(pin,terrainSourceState(4,[rows[0],{...rows[1],revision:4}]));
 assert.notEqual(pin,terrainSourceState(4,[...rows,{id:"c",revision:1}]));assert.deepEqual(rows,[{id:"b",revision:2},{id:"a",revision:3}]);
  assert.equal(advanceTerrainSourceState(pin,"a",4),terrainSourceState(4,[rows[0],{...rows[1],revision:4}]));
  assert.equal(advanceTerrainSourceState(pin,"missing",4),pin);assert.equal(advanceTerrainSourceState(undefined,"a",4),undefined);
});
test("regional Canvas clipping projects the original physical frame and both seam copies",()=>{
 const rects:number[][]=[];let clips=0;
 const ctx={beginPath(){},rect(...values:number[]){rects.push(values);},clip(){clips++;}} as unknown as CanvasRenderingContext2D;
 clipTerrainRegion(ctx,{x:-950,y:15,scale:.01},{x:99000,y:2000,width:2000,height:3000},100000,true);
 assert.deepEqual(rects,[[-960,35,20,30],[40,35,20,30],[1040,35,20,30]]);assert.equal(clips,1);
 clipTerrainRegion(ctx,{x:0,y:0,scale:1},undefined,100000,true);assert.equal(clips,1);
});
test("inherited Town captions stay inside a wrapped regional extent without overlapping",()=>{
 const view={x:0,y:0,scale:.01},frame={x:190000,y:10000,width:20000,height:60000},viewport={width:3000,height:1000};
 const first=regionalTownCaption({x:195000,y:30000},{x:1950,y:300},view,frame,200000,true,viewport,130,[])!;
 const second=regionalTownCaption({x:5000,y:30000},{x:2050,y:300},view,frame,200000,true,viewport,130,[first])!;
 assert.ok(first.x>=1900&&first.x+first.width<=2100);assert.ok(second.x>=1900&&second.x+second.width<=2100);
 assert.ok(first.y+first.height<=second.y||second.y+second.height<=first.y||first.x+first.width<=second.x||second.x+second.width<=first.x);
 assert.equal(regionalTownCaption({x:5000,y:30000},{x:2050,y:300},view,{...frame,width:1},200000,true,viewport,130,[]),null);
});
