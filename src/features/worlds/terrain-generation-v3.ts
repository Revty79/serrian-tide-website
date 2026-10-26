import type {TerrainGeometry} from "./terrain";
import {intentPlanSchema,intentPoint,intentWarnings,landKind,type IntentFeature,type IntentPlan} from "./terrain-intent";
import type {GenerationRecipeV3} from "./terrain-source";
import {physicalFractal,physicalRandom,physicalSeed,smooth01,wrappedDistance} from "./terrain-physical-noise";

type Compiled={feature:IntentFeature;x:number;y:number;width:number;height:number;angle:number;seed:number};
function compile(plan:IntentPlan,seed:number){const out:Compiled[]=[];for(const f of plan.features){const p=intentPoint(f,plan),s=physicalSeed(f.id)^seed;if(f.kind==="chain"){const a=f.angle*Math.PI/180;for(let n=0;n<f.count;n++){const t=f.count===1?0:n/(f.count-1)-.5;let x=t*f.width,y=Math.sin(n*1.7+physicalRandom(n,1,s)*2)*f.height*.2;if(f.distribution!=="chain"){const angle=physicalRandom(n,2,s)*Math.PI*2,r=f.distribution==="cluster"?physicalRandom(n,3,s):Math.sqrt(physicalRandom(n,3,s));x=Math.cos(angle)*r*f.width/2;y=Math.sin(angle)*r*f.height/2;}out.push({feature:{...f,kind:"island"},x:p.x+x*Math.cos(a)-y*Math.sin(a),y:p.y+x*Math.sin(a)+y*Math.cos(a),width:f.islandWidth,height:f.islandWidth*.7,angle:physicalRandom(n,4,s)*Math.PI,seed:s+n*7919});}}else out.push({feature:f,...p,width:f.width,height:f.height,angle:f.angle*Math.PI/180,seed:s});}return out;}
export function validateIntentHeights(shape:TerrainGeometry,r:GenerationRecipeV3,sea:number){
 if(sea-r.oceanDepthM<shape.min)throw Object.assign(Error("The requested ocean floor is below the allowed minimum elevation. Adjust the depth or World elevation limits explicitly."),{issues:[{path:["oceanDepthM"],message:"Choose an ocean depth inside the allowed elevation range."}]});
 for(const [i,f] of r.plan.features.entries()){
  let problem="";
  if(sea+f.elevation<shape.min||sea+f.elevation>shape.max)problem="its requested elevation is outside this map's allowed range";
  else if((landKind(f.kind)||["mountains","plains","highlands","plateau"].includes(f.kind))&&f.elevation<=0)problem="this landform needs a target above sea level; use a depression for submerged relief";
  else if(f.kind==="bay"&&f.elevation>=0)problem="a bay needs a target below sea level";
  if(problem){const message=`${f.name}: ${problem}. Adjust the feature height explicitly.`;throw Object.assign(Error(message),{issues:[{path:["plan","features",i,"elevation"],message}]});}
 }
}
export function generateAuthoredTerrain(shape:TerrainGeometry,r:GenerationRecipeV3,sea:number,progress?:(p:number)=>void){
 const plan=intentPlanSchema.parse(r.plan);validateIntentHeights(shape,r,sea);if(plan.space.width!==shape.displayWidth||plan.space.height!==shape.displayHeight)throw Error("This geographic plan belongs to different physical terrain dimensions. Reinterpret or adjust its frame explicitly.");
 const seed=physicalSeed(r.seed),compiled=compile(plan,seed),columns=shape.width/32,rows=shape.height/32,candidates:Array<number[]>=Array.from({length:columns*rows},()=>[]),sx=shape.displayWidth/shape.width,sy=shape.displayHeight/shape.height,period=plan.space.periodX??0;
 // Bounded per-tile spatial candidates, in physical coordinates. No whole-World feature scan per sample.
 for(const [i,f] of compiled.entries()){const radius=Math.hypot(f.width,f.height)*.65;for(const offset of period?[-period,0,period]:[0]){const left=Math.max(0,Math.floor((f.x+offset-radius-plan.space.x)/sx/32)),right=Math.min(columns-1,Math.floor((f.x+offset+radius-plan.space.x)/sx/32)),top=Math.max(0,Math.floor((f.y-radius-plan.space.y)/sy/32)),bottom=Math.min(rows-1,Math.floor((f.y+radius-plan.space.y)/sy/32));for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(!candidates[y*columns+x].includes(i))candidates[y*columns+x].push(i);}}
 const grid=new Int16Array(shape.width*shape.height).fill(Math.round(sea-r.oceanDepthM));
 for(let key=0;key<candidates.length;key++){const list=candidates[key];if(!list.length){progress?.((key+1)/candidates.length);continue;}const lands=list.filter(i=>landKind(compiled[i].feature.kind)),modifiers=list.filter(i=>!landKind(compiled[i].feature.kind)).sort((a,b)=>(compiled[a].feature.kind==="bay"?1:0)-(compiled[b].feature.kind==="bay"?1:0));
  for(let y=Math.floor(key/columns)*32;y<(Math.floor(key/columns)+1)*32;y++)for(let x=key%columns*32;x<(key%columns+1)*32;x++){
   const wx=plan.space.x+(x+.5)*sx,wy=plan.space.y+(y+.5)*sy,a=plan.area;if(wx<a.x||wx>a.x+a.width||wy<a.y||wy>a.y+a.height)continue;let value=sea-r.oceanDepthM;
   const geometry=(f:Compiled)=>{const dx=wrappedDistance(wx,f.x,period),dy=wy-f.y,c=Math.cos(f.angle),s=Math.sin(f.angle);return {u:(dx*c+dy*s)/(f.width/2),v:(-dx*s+dy*c)/(f.height/2),dx,dy};};
   for(const i of lands){const f=compiled[i],g=geometry(f),distance=Math.hypot(g.u,g.v);if(distance>1.3)continue;const angle=Math.atan2(g.v,g.u),coast=f.feature.coastline/100,phase=physicalRandom(1,2,f.seed)*Math.PI*2,rim=Math.min(1,Math.max(.62,.93+coast*(.18*Math.sin(angle*3+phase)+.12*Math.sin(angle*5-phase)+.07*Math.cos(angle*7+phase)+.04*physicalFractal(g.dx/1000,g.dy/1000,Math.min(f.width,f.height)/1000*.08,f.seed)))),signed=(rim-distance)*Math.min(f.width,f.height)/2,transition=Math.min(f.width,f.height)*.04;
    if(signed<=0){value=Math.max(value,sea-r.oceanDepthM*smooth01(-signed/transition));continue;}const rough=physicalFractal(g.dx/1000,g.dy/1000,Math.max(.00001,Math.min(f.width,f.height)/8000),f.seed+1103)*Math.min(200,f.feature.elevation*.25)*f.feature.ruggedness/100,above=Math.max(1,f.feature.elevation+rough);value=Math.max(value,sea+above*smooth01(signed/transition));
   }
   for(const i of modifiers){const f=compiled[i],g=geometry(f),distance=Math.hypot(g.u,g.v);if(distance>=1)continue;const kind=f.feature.kind;if(kind!=="bay"&&value<=sea)continue;let weight=(1-distance*distance)**2,target=sea+f.feature.elevation;
    if(kind==="mountains"){const bend=Math.sin(g.u*Math.PI*1.7)*.16,v=(g.v-bend)/.9;if(Math.abs(g.u)>=1||Math.abs(v)>=1)continue;weight=(1-v*v)**2*Math.pow(Math.max(0,Math.cos(g.u*Math.PI/2)),.6);target+=physicalFractal(g.dx/1000,g.dy/1000,Math.max(.00001,f.height/2000),f.seed)*Math.abs(f.feature.elevation)*f.feature.ruggedness/100*.08;value=Math.max(value,value+(target-value)*weight);}
    else{if(kind==="plateau"||kind==="plains")weight=smooth01((1-distance)*4);if(kind==="bay")weight=smooth01((1-distance)*5);if(kind==="valley"||kind==="depression"||kind==="bay")value=Math.min(value,value+(target-value)*weight);else value+= (target-value)*weight;}
   }
   grid[y*shape.width+x]=Math.round(Math.max(shape.min,Math.min(shape.max,value)));
  }progress?.((key+1)/candidates.length);
 }
 return {grid,resolvedPreset:r.preset,layoutWarnings:intentWarnings(shape,plan),featureCount:compiled.filter(f=>landKind(f.feature.kind)).length,rangeCount:compiled.filter(f=>f.feature.kind==="mountains").length};
}
