import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {terrainGeometry,terrainSettingsSchema} from "./terrain";
import {generateTerrain,regenerateArea} from "./terrain-generation";
import {presetRecipe,EMPTY_PROTECTION,protectSamples,isProtected,protectionGrid} from "./terrain-source";
const shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:256,gridHeight:160}));
const digest=(grid:Int16Array)=>createHash("sha256").update(new Uint8Array(grid.buffer)).digest("hex");
test("all six numerical presets are deterministic, bounded and near their requested land fraction",()=>{
 for(const preset of ["continent","continents","archipelago","island","land","random"] as const){const recipe=presetRecipe(preset,"Silver shoals"),a=generateTerrain(shape,recipe,0),b=generateTerrain(shape,recipe,0);assert.equal(digest(a.grid),digest(b.grid));assert.notEqual(digest(a.grid),digest(generateTerrain(shape,{...recipe,seed:"Other shoals"},0).grid));const land=a.grid.filter(v=>v>0).length/a.grid.length;assert.ok(Math.abs(land-recipe.landCoverage/100)<.012,`${preset} ${land}`);assert.ok(a.grid.some(v=>v< -100));assert.ok(a.grid.some(v=>v>300));assert.ok(a.grid.every(v=>v>=shape.min&&v<=shape.max));}
});
test("wrapped world seams have adjacent-sample slopes comparable to the rest of the numerical map",()=>{
 for(const preset of ["continent","continents","archipelago","land"] as const)for(const seed of ["Seam one","Seam two","Seam three"]){const g=generateTerrain({...shape,wrap:true},presetRecipe(preset,seed),0).grid;let seam=0,interior=0;for(let y=0;y<shape.height;y++){seam+=Math.abs(g[y*shape.width]-g[y*shape.width+shape.width-1]);for(let x=1;x<shape.width;x++)interior+=Math.abs(g[y*shape.width+x]-g[y*shape.width+x-1]);}assert.ok(seam/shape.height<interior/(shape.height*(shape.width-1))*5+70,`${preset}/${seed}: discontinuous seam`);}
});
test("regeneration affects only its accepted rectangle and protects manual cells by default",()=>{
 const base=new Int16Array(shape.width*shape.height).fill(123),proposal=new Int16Array(base.length).fill(900),protectedCells=new Uint8Array(base.length),area={x:40,y:50,width:80,height:60};protectedCells[60*shape.width+50]=1;
 const kept=regenerateArea(base,proposal,shape,area,protectedCells,true,6);assert.equal(kept.protectedCount,1);assert.equal(kept.grid[60*shape.width+50],123);assert.ok(kept.changed>0);
 for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)if(x<40||x>=120||y<50||y>=110)assert.equal(kept.grid[y*shape.width+x],123);
 assert.equal(regenerateArea(base,proposal,shape,area,protectedCells,false,0).grid[60*shape.width+50],900);assert.ok(base.every(v=>v===123));
 assert.throws(()=>regenerateArea(base,proposal,shape,{x:255,y:0,width:4,height:1},protectedCells,true,0));
});
test("manual protection unions exact samples while older tiles remain conservatively protected",()=>{
 const first=protectSamples(EMPTY_PROTECTION,[0,33,1023]),both=protectSamples(first,[200]);for(const i of [0,33,200,1023])assert.equal(isProtected(both,i),true);assert.equal(isProtected(both,34),false);assert.equal(isProtected("legacy",34),true);assert.equal(protectSamples("legacy",[]),"f".repeat(256));const grid=protectionGrid([{x:1,y:0,mask:first}],64,32);assert.equal(grid[32],1);assert.equal(grid[64+33],1);assert.equal(grid[31*64+63],1);
});
