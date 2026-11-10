/** Compare actual captured cameras, never just requested helper coordinates. */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type {GraphicsCapture} from "./worlds-graphics-a2-browser";
type ComparisonRow=Pick<GraphicsCapture,"map"|"scene"|"style"|"dpr"|"quality">&{exactCamera:boolean;driftPx:number;[key:string]:unknown};
async function main(){
 const root=path.resolve("artifacts/atlas-graphics-a2"),before=path.resolve(process.env.SERRIAN_A2_BEFORE??path.join(root,"baseline-6")),after=path.resolve(process.env.SERRIAN_A2_AFTER??path.join(root,"candidate-1"));for(const dir of [before,after])assert(dir.startsWith(root+path.sep));
 const a=JSON.parse(await readFile(path.join(before,"capture-progress.json"),"utf8")) as GraphicsCapture[],b=JSON.parse(await readFile(path.join(after,"capture-progress.json"),"utf8")) as GraphicsCapture[],rows:ComparisonRow[]=[];
 for(const x of a){const y=b.find(r=>r.map===x.map&&r.scene===x.scene&&r.style===x.style&&r.dpr===x.dpr&&r.quality===x.quality);if(!y)continue;
  for(const key of ["map","scene","style","dpr","quality","point","span","css","backing","appearance"] as const)assert.deepEqual(y[key],x[key],key);
  const exact=JSON.stringify(x.view)===JSON.stringify(y.view),corners=[[0,0],[x.css.width,x.css.height]],driftPx=Math.max(...corners.flatMap(([px,py])=>[Math.abs(((px-x.view.x)/x.view.scale)*y.view.scale+y.view.x-px),Math.abs(((py-x.view.y)/x.view.scale)*y.view.scale+y.view.y-py)]));
  // Do not call a near-match an exact pair. Preserve actual values in the receipt.
  const images=await Promise.all([path.join(before,x.file),path.join(after,y.file)].map(file=>sharp(file).extract({left:0,top:140*x.dpr,width:x.backing.width,height:x.backing.height-210*x.dpr}).removeAlpha().raw().toBuffer()));assert.equal(images[0].length,images[1].length);let sum=0,changed=0,max=0;for(let i=0;i<images[0].length;i++){const delta=Math.abs(images[0][i]-images[1][i]);sum+=delta;max=Math.max(max,delta);if(delta)changed++;}
  rows.push({map:x.map,scene:x.scene,style:x.style,dpr:x.dpr,quality:x.quality,exactCamera:exact,driftPx,beforeView:x.view,afterView:y.view,beforeMs:x.readyMs,afterMs:y.readyMs,beforeInputMs:x.inputMs,afterInputMs:y.inputMs,beforeVisualDpr:x.data.detailVisualDpr,afterVisualDpr:y.data.detailVisualDpr,beforeDetailBytes:x.data.detailBytes,afterDetailBytes:y.data.detailBytes,pixels:{meanChannelDifference:sum/images[0].length,maxChannelDifference:max,changedFraction:changed/images[0].length,exactPair:exact},beforeFile:x.file,afterFile:y.file});
 }
 assert(rows.length);const result={passed:true,compared:rows.length,exactPairs:rows.filter(r=>r.exactCamera).length,nearPairs:rows.filter(r=>!r.exactCamera&&r.driftPx<.001).length,unmatchedBefore:a.filter(x=>!rows.some(r=>r.map===x.map&&r.scene===x.scene&&r.style===x.style&&r.dpr===x.dpr&&r.quality===x.quality)).length,baselineAggregatePassed:await readFile(path.join(before,"results.json"),"utf8").then(x=>JSON.parse(x).passed,()=>false),rows};const filename=process.env.SERRIAN_A2_COMPARISON_FILE??"before-after.json";assert(/^[a-z0-9-]+\.json$/.test(filename));await writeFile(path.join(after,filename),JSON.stringify(result,null,2));console.log(JSON.stringify({compared:result.compared,exactPairs:result.exactPairs,nearPairs:result.nearPairs,baselineAggregatePassed:result.baselineAggregatePassed}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
