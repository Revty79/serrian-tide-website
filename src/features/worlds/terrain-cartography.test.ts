import {test} from "node:test";
import assert from "node:assert/strict";
import {mapAppearanceSchema,DEFAULT_MAP_APPEARANCE,appearanceRelief,visualAppearance,viewContourInterval} from "./terrain-appearance";
import {parseTerrainRelief,CLASSIC_RELIEF,ENHANCED_RELIEF} from "./terrain-relief";
import {cartographicColor,contourCell,tileContours,terrainInkField} from "./terrain-cartography";
import {overviewSampler,rootCartographyLodLimit} from "./terrain-cartography-painter";
import {terrainGeometry,terrainSettingsSchema} from "./terrain";

test("appearance is a strict versioned presentation with exact legacy relief compatibility",()=>{
 assert.deepEqual(parseTerrainRelief(CLASSIC_RELIEF),CLASSIC_RELIEF);assert.deepEqual(parseTerrainRelief(ENHANCED_RELIEF),ENHANCED_RELIEF);
 for(const style of ["classic-elevation","physical-relief","topographic","illustrated-fantasy"] as const){const spec={...DEFAULT_MAP_APPEARANCE,style};assert.deepEqual(visualAppearance(parseTerrainRelief(appearanceRelief(spec))!),spec);}
 assert.equal(mapAppearanceSchema.safeParse({...DEFAULT_MAP_APPEARANCE,elevations:[1]}).success,false);assert.equal(mapAppearanceSchema.safeParse({...DEFAULT_MAP_APPEARANCE,version:3}).success,false);assert.equal(parseTerrainRelief({...ENHANCED_RELIEF,appearance:{...DEFAULT_MAP_APPEARANCE,intervalM:-1}}),null);
});
test("contours interpolate actual elevations and resolve saddles from the numerical centre",()=>{
 assert.deepEqual(contourCell([0,100,100,0],50),[[[.5,0],[.5,1]]]);assert.deepEqual(contourCell([0,100,100,0],200),[]);
 const low=contourCell([100,-200,100,-200],0),high=contourCell([200,-100,200,-100],0);assert.equal(low.length,2);assert.equal(high.length,2);assert.notDeepEqual(low,high);
});
test("coast and elevation linework agrees with a physical numerical plane across tile boundaries",()=>{
 const sample=(x:number,y:number)=>x*10+y*3-220,interval=50,left=tileContours(sample,0,0,0,interval,true),right=tileContours(sample,32,0,0,interval,true);
 for(const [segments,x0] of [[left,0],[right,32]] as const)for(const segment of segments)for(const [x,y] of [segment.a,segment.b])assert.ok(Math.abs(sample(x+x0-.5,y-.5)-segment.height)<1e-8);
 const crossings=(segments:typeof left,offset:number)=>[...new Set(segments.flatMap(s=>{const a=s.a[0]+offset,b=s.b[0]+offset;if(Math.min(a,b)>32||Math.max(a,b)<32||a===b)return [];const y=s.a[1]+(s.b[1]-s.a[1])*(32-a)/(b-a);return [s.height+":"+y.toFixed(8)];}))].sort();assert.deepEqual(crossings(left,0),crossings(right,32));
});
test("one-metre contour requests on extreme slopes have a fixed numerical-cell workload ceiling",()=>{
 const segments=tileContours((x,y)=>(x+y)%2?30000:-30000,0,0,0,1,true);assert.ok(segments.length>0&&segments.length<=33*33*30);assert.ok(segments.every(s=>Number.isFinite(s.height)&&[...s.a,...s.b].every(Number.isFinite)));
});
test("all refinement levels share viewport contour intervals and explicit vertical metres",()=>{
 const spec={...DEFAULT_MAP_APPEARANCE,style:"topographic" as const};assert.ok(viewContourInterval(spec,1e9)>viewContourInterval(spec,20000));assert.equal(viewContourInterval({...spec,intervalM:25},1e9),25);assert.equal(viewContourInterval({...spec,intervalM:25},1000),25);
});
test("cartographic material colors distinguish land, depth and illustrated paper without noise",()=>{
 const topo={...DEFAULT_MAP_APPEARANCE,style:"topographic" as const},fantasy={...topo,style:"illustrated-fantasy" as const};assert.notDeepEqual(cartographicColor(1500,topo),cartographicColor(1500,fantasy));assert.notDeepEqual(cartographicColor(-10,topo),cartographicColor(-5000,topo));assert.deepEqual(cartographicColor(-10,{...topo,bathymetry:false}),cartographicColor(-5000,{...topo,bathymetry:false}));assert.notDeepEqual(cartographicColor(1000,fantasy),cartographicColor(1000,{...fantasy,paper:"parchment"}));
});
test("cartographic numerical overviews match recursive rounded saved overviews and never mutate samples",()=>{
 const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:64,gridHeight:64,wrap:true})),grid=Int16Array.from({length:4096},(_,i)=>(i*7919%10007)-5000),original=grid.slice();let level=grid.slice(),width=64;
 for(let lod=0;lod<=1;lod++){const sample=overviewSampler(grid,shape,lod);for(let y=0;y<width;y++)for(let x=0;x<width;x++)assert.equal(sample(x,y),level[y*width+x]);assert.equal(sample(-1,0),level[width-1]);const next=new Int16Array(level.length/4);for(let y=0;y<width/2;y++)for(let x=0;x<width/2;x++)next[y*width/2+x]=Math.round((level[y*2*width+x*2]+level[y*2*width+x*2+1]+level[(y*2+1)*width+x*2]+level[(y*2+1)*width+x*2+1])/4);level=next;width/=2;}assert.deepEqual(grid,original);
});
test("rectangular and odd tile-count World grids never use fractional or partial-tile overviews",()=>{
 for(const [width,height,expected] of [[640,384,2],[672,384,0],[1024,1024,5],[32,64,0]])assert.equal(rootCartographyLodLimit(terrainGeometry(terrainSettingsSchema.parse({gridWidth:width,gridHeight:height}))),expected);
});
test("illustrated creases follow connected numerical ridges and valleys and exclude flat or planar land",()=>{
 assert.equal(terrainInkField(()=>400,5,5,0),null);assert.equal(terrainInkField((x,y)=>500+x*10+y*3,5,5,0),null);
 for(let x=2;x<12;x++){const ridge=terrainInkField((_x,y)=>1000-20*(y-8)**2,x,8,0)!;assert.ok(ridge.ridge);assert.ok(Math.abs(ridge.derivative)<1e-8);assert.ok(Math.abs(ridge.ny)>.99);const valley=terrainInkField((_x,y)=>400+20*(y-8)**2,x,8,0)!;assert.equal(valley.ridge,false);assert.ok(Math.abs(valley.derivative)<1e-8);}
});
