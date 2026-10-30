import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {terrainRasterFrame} from "../src/features/worlds/terrain-raster-frame";
import type {checkRegionsBrowser} from "./worlds-regions-browser-checks";
/** Actual software Canvas readback, independent of terrain shading. Constant
 * opaque and translucent tiles must not acquire a false geographic grid. */
export async function checkRegionalRasterSeams({browser,out}:Pick<Parameters<typeof checkRegionsBrowser>[0],"browser"|"out">){
 const page=await browser.newPage(),cases=[];
 try{for(const dpr of [1,2])for(const alpha of [1,.28])for(const aligned of [false,true]){const quads=[];for(let y=-1;y<6;y++)for(let x=-1;x<9;x++){const frame={x:x*53.927,y:y*57.519,width:53.927,height:57.519},view={x:.317,y:.143,scale:1};quads.push(aligned?terrainRasterFrame(view,frame,dpr):{x:view.x+frame.x,y:view.y+frame.y,width:frame.width+.02,height:frame.height+.02});}
 const result=await page.evaluate(({dpr,alpha,quads})=>{const c=document.createElement("canvas");c.width=400*dpr;c.height=240*dpr;const ctx=c.getContext("2d")!;ctx.scale(dpr,dpr);ctx.fillStyle="rgb(60,70,80)";ctx.fillRect(0,0,400,240);const tile=document.createElement("canvas");tile.width=tile.height=98;const tc=tile.getContext("2d")!;tc.fillStyle=`rgba(170,150,100,${alpha})`;tc.fillRect(0,0,98,98);for(const q of quads){ctx.save();ctx.beginPath();ctx.rect(q.x,q.y,q.width,q.height);ctx.clip();ctx.drawImage(tile,1,1,96,96,q.x,q.y,q.width,q.height);ctx.restore();}const pixels=ctx.getImageData(20*dpr,20*dpr,360*dpr,200*dpr).data,min=[255,255,255],max=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let j=0;j<3;j++){min[j]=Math.min(min[j],pixels[i+j]);max[j]=Math.max(max[j],pixels[i+j]);}return {min,max,spread:max.map((v,i)=>v-min[i])};},{dpr,alpha,quads});cases.push({dpr,alpha,aligned,...result});if(aligned)assert.deepEqual(result.spread,[0,0,0],"Adjacent constant raster tiles must not create artificial boundary lines");}
 await writeFile(out+"/raster-seams.json",JSON.stringify({passed:true,gpuDisabled:true,constantTerrainAndTranslucentEnvironment:true,devicePixelsOnly:true,geographicDataWrites:false,cases},null,2)+"\n");
 }finally{await page.close();}
}
