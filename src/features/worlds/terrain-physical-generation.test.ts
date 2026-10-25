import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import golden from "./terrain-v1-golden.json";
import {terrainGeometry,terrainSettingsSchema,type TerrainGeometry} from "./terrain";
import {generateTerrain} from "./terrain-generation";
import {presetRecipe,presetRecipeV1,applyGeographicScale,generationRecipeSchema,terrainSourceSchema} from "./terrain-source";
import {assessGeographicScale,sampleSpacingKm} from "./terrain-scale";
import {physicalNoise} from "./terrain-physical-noise";
import {validateGenerationAcceptance} from "./terrain-generation-acceptance";
const shape=(widthKm=10000,heightKm=widthKm,gridWidth=512,gridHeight=gridWidth)=>terrainGeometry(terrainSettingsSchema.parse({widthKm,heightKm,gridWidth,gridHeight,minElevation:-20000,maxElevation:20000}));
const hash=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer)).digest("hex");
// Physical covariance measures an irregular, rotated landform without assuming
// its long axis matches a grid axis. For an ellipse, 4 sigma is its full span.
function landSpan(grid:Int16Array,s:TerrainGeometry){let count=0,xsum=0,ysum=0,xx=0,xy=0,yy=0;const spacing=sampleSpacingKm(s);for(let i=0;i<grid.length;i++)if(grid[i]>0){count++;xsum+=(i%s.width+.5)*spacing.x;ysum+=(Math.floor(i/s.width)+.5)*spacing.y;}for(let i=0;i<grid.length;i++)if(grid[i]>0){const x=(i%s.width+.5)*spacing.x-xsum/count,y=(Math.floor(i/s.width)+.5)*spacing.y-ysum/count;xx+=x*x;xy+=x*y;yy+=y*y;}return 4*Math.sqrt((xx+yy+Math.hypot(xx-yy,2*xy))/(2*count));}
test("v1 retains all twelve pre-Pass-5 numerical hashes and exact source parsing",()=>{
 for(const [key,expected] of Object.entries(golden)){const [preset,wrap]=key.split(":"),s={...shape(20000,12000,256,160),min:-12000,max:12000,wrap:wrap==="true"},recipe=presetRecipeV1(preset as "continent","Pass 5 retained recipe"),source={kind:"generated",recipe};assert.deepEqual(terrainSourceSchema.parse(source),source);assert.equal(hash(generateTerrain(s,recipe,0).grid),expected,key);}
});
test("a requested 5000 km continent retains comparable physical span on 10000, 40000 and rectangular maps",()=>{
 const recipe=presetRecipe("continent","physical scale check"),spans=[shape(10000),shape(40000,40000,1024),shape(20000,10000)].map(s=>landSpan(generateTerrain(s,recipe,0).grid,s));
 assert.ok(spans.every(v=>v>4000&&v<6000),String(spans));assert.ok(Math.max(...spans)/Math.min(...spans)<1.03,String(spans));
});
test("allowed elevation bounds do not multiply intended physical heights or alter numerical output",()=>{
 const s=shape(),r=presetRecipe("continent"),a=generateTerrain({...s,min:-6000,max:6000},r,0).grid,b=generateTerrain({...s,min:-30000,max:30000},r,0).grid;assert.equal(hash(a),hash(b));assert.ok(a.every(v=>v>=-4500&&v<=3500));assert.ok(a.some(v=>v>3000));assert.throws(()=>generateTerrain({...s,max:2000},r,0),/intended.*bounds/);
});
test("all six physical presets are seeded, bounded and coverage never resizes geography",()=>{
 for(const preset of ["continent","continents","archipelago","island","land","random"] as const){const s=shape(40000,24000,256,160),r=presetRecipe(preset,"Scale seeds"),a=generateTerrain(s,r,0),b=generateTerrain(s,r,0);assert.equal(hash(a.grid),hash(b.grid));assert.equal(hash(a.grid),hash(generateTerrain(s,{...r,landCoverage:90},0).grid));assert.notEqual(hash(a.grid),hash(generateTerrain(s,{...r,seed:"Other scales"},0).grid));assert.ok(a.grid.every(v=>v>=s.min&&v<=s.max));}
});
test("million-km worlds report missing samples without expanding a familiar feature; colossal remains deliberate",()=>{
 const s=shape(1000000,1000000,1024),r=presetRecipe("continent","physical scale check"),a=assessGeographicScale(s,r);assert.equal(a.spacingXKm,976.5625);assert.ok(a.spanSamplesX<6);assert.equal(a.requiresAcknowledgement,true);assert.equal(a.coverageConflict,true);assert.ok(a.warnings.join(" ").includes("Zoom cannot"));const familiar=generateTerrain(s,r,0).grid,colossal=generateTerrain(s,applyGeographicScale(r,"colossal"),0).grid;assert.ok(landSpan(familiar,s)<7000);assert.ok(landSpan(colossal,s)>150000);assert.ok(colossal.every(v=>v>=-10000&&v<=10000));
});
test("physical noise is periodic in X and does not confuse unequal sample distances",()=>{
 for(const x of [-5000,-38,0,17,9999])for(const y of [-67,89,312])assert.ok(Math.abs(physicalNoise(x,y,150,711,10000)-physicalNoise(x+10000,y,150,711,10000))<1e-10);
 const s=shape(20000,10000,512,256);assert.equal(sampleSpacingKm(s).x,sampleSpacingKm(s).y);
});
test("versioned recipes reject incomplete physical settings and preserve acknowledged provenance",()=>{
 assert.equal(generationRecipeSchema.safeParse({...presetRecipeV1("island"),version:"world-heightmap-v2"}).success,false);const source={kind:"generated",recipe:presetRecipe("island"),scaleAcknowledged:true};assert.deepEqual(terrainSourceSchema.parse(source),source);assert.equal(generationRecipeSchema.safeParse({...presetRecipe("island"),islandWidthKm:Infinity}).success,false);
});
test("islands retain physical proportions on grids with mismatched sample and World aspect ratios",()=>{
 const r=presetRecipe("island","physical island"),spans=[shape(10000,10000,1024),shape(20000,10000,1024),shape(40000,40000,1024)].map(s=>landSpan(generateTerrain(s,r,0).grid,s));assert.ok(spans.every(v=>v>400&&v<700),String(spans));assert.ok(Math.max(...spans)/Math.min(...spans)<1.08,String(spans));
});
test("multiple-landmass layout uses physical gaps instead of expanding with the surrounding canvas",()=>{
 const r={...presetRecipe("continents","Physical gaps"),landmasses:3},a=shape(40000,40000,512),b=shape(80000,80000,1024),spanA=landSpan(generateTerrain(a,r,0).grid,a),spanB=landSpan(generateTerrain(b,r,0).grid,b);assert.ok(Math.abs(spanA-spanB)<spanA*.02,`${spanA} ${spanB}`);const wider=landSpan(generateTerrain(b,{...r,landmassSpacingKm:10000},0).grid,b);assert.ok(wider>spanB*1.3,`${wider} ${spanB}`);
});
test("wrapped physical continents and ranges cross the seam without a special edge cliff",()=>{
 const s={...shape(10000,10000,256),wrap:true},r={...presetRecipe("continents","Wrapped physical belts"),landmasses:3,islandDistribution:"chains" as const},g=generateTerrain(s,r,0).grid;let seam=0,interior=0,land=0;for(let y=0;y<s.height;y++){seam+=Math.abs(g[y*s.width]-g[y*s.width+s.width-1]);if(g[y*s.width]>0)land++;for(let x=1;x<s.width;x++)interior+=Math.abs(g[y*s.width+x]-g[y*s.width+x-1]);}assert.ok(land>0);assert.ok(seam/s.height<interior/(s.height*(s.width-1))*4+40);
});
test("highland distribution works independently of mountain belts and saved limits",()=>{
 const s=shape(10000,10000,256),r={...presetRecipe("continent"),mountains:0,ruggedness:0,elevationVariation:0,highlandHeightM:2000},plain=generateTerrain(s,{...r,highlandCoverage:0},0).grid,upland=generateTerrain(s,{...r,highlandCoverage:100},0).grid,mean=(g:Int16Array)=>{let sum=0,n=0;for(const z of g)if(z>0){sum+=z;n++;}return sum/n;};assert.ok(mean(upland)>mean(plain)*3);assert.ok(plain.every(z=>z<=200));
});
test("server admission requires deliberate low-resolution acceptance and respects intended heights",()=>{
 const s=shape(1000000,1000000,1024),source={kind:"generated" as const,recipe:presetRecipe("continent")};assert.throws(()=>validateGenerationAcceptance(s,source,0),/acknowledge/);assert.doesNotThrow(()=>validateGenerationAcceptance(s,{...source,scaleAcknowledged:true},0));assert.throws(()=>validateGenerationAcceptance({...s,max:2000},{...source,scaleAcknowledged:true},0),/bounds/);assert.doesNotThrow(()=>validateGenerationAcceptance(s,{kind:"generated",recipe:presetRecipeV1("continent")},0));
});
test("pathological overlaps stop at a bounded candidate budget without resizing requested geography",()=>{
 const s=shape(10000,10000,1024),r={...presetRecipe("archipelago"),landmasses:64,islandWidthKm:2000000};assert.throws(()=>generateTerrain(s,r,0),/too many overlapping terrain candidates/);assert.equal(r.islandWidthKm,2000000);
});
