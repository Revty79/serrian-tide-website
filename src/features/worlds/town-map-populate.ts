import {townBounds,townRound,townWaterAt,townWaterCrosses,validateTownDesign,TOWN_MAP_LIMITS,type TownBackdrop,type TownDesign,type TownFeature,type TownFrame,type TownPoint} from "./town-map";
import {defaultTownBrush,makeTownStamp,townBuildingPresets,townPreset,type TownBrush} from "./town-map-presets";
import {nearestTownRoad,sampleTownRoad,townRoadAtDistance} from "./town-road";

export type TownPopulationOptions={density:"sparse"|"normal"|"dense";side:"both"|"left"|"right";mix:"residential"|"commercial"|"mixed";size:"small"|"mixed";face:boolean;variation:boolean;gap:number;setback:number;seed:number;categories:string[];architecture:TownBrush["architecture"]};
export const defaultTownPopulation=():TownPopulationOptions=>({density:"normal",side:"both",mix:"residential",size:"mixed",face:true,variation:true,gap:5,setback:3,seed:1,categories:["cottage","house"],architecture:"timber"});
export const townPopulationMix={residential:["cottage","house","townhouse"],commercial:["shop","inn","workshop"],mixed:["cottage","house","shop","inn","workshop"]};
const intersects=(a:TownPoint,b:TownPoint,c:TownPoint,d:TownPoint)=>{const cross=(p:TownPoint,q:TownPoint,r:TownPoint)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return cross(a,b,c)*cross(a,b,d)<=1e-8&&cross(c,d,a)*cross(c,d,b)<=1e-8&&Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y);};
const inside=(p:TownPoint,ps:TownPoint[])=>{let result=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;};
const distance=(p:TownPoint,a:TownPoint,b:TownPoint)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
/** Additive, bounded visual parcels. Original records, geometry, and links are never rewritten. */
export function populateTownRoad(road:TownFeature,design:TownDesign,frame:TownFrame,backdrop:TownBackdrop,options:TownPopulationOptions){
 const warnings:string[]=[],additions:TownFeature[]=[],skipped:Record<string,number>={water:0,steep:0,occupied:0,road:0,edge:0},categories=options.categories.filter(id=>townBuildingPresets.some(p=>p.id===id)),points=sampleTownRoad(road),length=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
 if(design.layers.buildings.locked)return {design,additions,warnings:["Buildings are locked. Unlock Buildings under Show or Lock Map Parts to use this tool."],skipped};
 if(road.archived||road.kind!=="road"||!categories.length)return {design,additions,warnings:["Choose a road and at least one building type."],skipped};
 if(design.features.length>=TOWN_MAP_LIMITS.features||design.features.reduce((n,s)=>n+s.points.length,0)>=TOWN_MAP_LIMITS.points)return {design,additions,warnings:["This map has reached its retained shape or point limit. Use another Town Map for additional neighborhoods. Your work is kept."],skipped};
 let state=2166136261;for(const c of road.id+":"+options.seed)state=Math.imul(state^c.charCodeAt(0),16777619);state=state||0x6d2b79f5;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const ids=new Set(design.features.map(f=>f.id)),uuid=()=>{let id:string;do{const h=Array.from({length:4},()=>Math.floor(random()*4294967296).toString(16).padStart(8,"0")).join("");id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;}while(ids.has(id));ids.add(id);return id;};
 const cellSize=40,bins=new Map<string,ReturnType<typeof townBounds>[]>(),wide:ReturnType<typeof townBounds>[]=[],roads=design.features.filter(s=>!s.archived&&s.kind==="road"),paths=new Map<TownFeature,TownPoint[]>();let cachedPoints=0,retainedPoints=design.features.reduce((n,s)=>n+s.points.length,0),attempts=0;
 const keys=(b:ReturnType<typeof townBounds>)=>{const result:string[]=[];for(let y=Math.floor(b.y/cellSize);y<=Math.floor((b.y+b.height)/cellSize);y++)for(let x=Math.floor(b.x/cellSize);x<=Math.floor((b.x+b.width)/cellSize);x++)result.push(x+":"+y);return result;};
 const bounds=(s:TownFeature)=>{const b=townBounds(s),padding=s.shape==="point"?s.width+1:s.kind==="wall"?s.width/2+1:1;return {x:b.x-padding,y:b.y-padding,width:b.width+padding*2,height:b.height+padding*2};};
 const occupy=(s:TownFeature)=>{const b=bounds(s);if((b.width/cellSize+2)*(b.height/cellSize+2)>256){wide.push(b);return;}for(const key of keys(b))bins.set(key,[...(bins.get(key)??[]),b]);};
 for(const s of design.features)if(!s.archived&&!["road","district","label"].includes(s.kind))occupy(s);
 const occupied=(s:TownFeature)=>{const b=bounds(s),overlap=(a:typeof b)=>b.x<a.x+a.width&&b.x+b.width>a.x&&b.y<a.y+a.height&&b.y+b.height>a.y;return wide.some(overlap)||keys(b).some(k=>bins.get(k)?.some(overlap));};
 const touchesRoad=(s:TownFeature)=>{const b=townBounds(s),center={x:b.x+b.width/2,y:b.y+b.height/2},radius=Math.hypot(b.width,b.height)/2;
  for(const r of roads){const clear=r.width/2+.75,near=nearestTownRoad(center,r,radius+clear);if(!near)continue;let path=paths.get(r);if(!path){path=sampleTownRoad(r,.1);if(cachedPoints+path.length<=32768){paths.set(r,path);cachedPoints+=path.length;}}
   for(let j=1;j<path.length;j++){const a=path[j-1],e=path[j];if(Math.max(a.x,e.x)<b.x-clear||Math.min(a.x,e.x)>b.x+b.width+clear||Math.max(a.y,e.y)<b.y-clear||Math.min(a.y,e.y)>b.y+b.height+clear)continue;if(inside(a,s.points)||inside(e,s.points))return true;for(let i=0;i<s.points.length;i++){const p=s.points[i],q=s.points[(i+1)%s.points.length];if(intersects(a,e,p,q)||Math.min(distance(p,a,e),distance(q,a,e),distance(a,p,q),distance(e,p,q))<clear)return true;}}
  }return false;
 };
 const cell=(p:TownPoint)=>Math.min(backdrop.size-1,Math.max(0,Math.round(p.y/frame.height*(backdrop.size-1))))*backdrop.size+Math.min(backdrop.size-1,Math.max(0,Math.round(p.x/frame.width*(backdrop.size-1))));
 const terrain=(s:TownFeature)=>{const ps=[...s.points,...s.points.map((p,i)=>({x:(p.x+s.points[(i+1)%s.points.length].x)/2,y:(p.y+s.points[(i+1)%s.points.length].y)/2})),{x:s.points.reduce((n,p)=>n+p.x,0)/s.points.length,y:s.points.reduce((n,p)=>n+p.y,0)/s.points.length}];
  if(ps.some(p=>backdrop.wet[cell(p)]||townWaterAt(p,backdrop))||townWaterCrosses(s.points,true,backdrop)||backdrop.water?.lakes.some(rings=>rings.some(ring=>ring.some(p=>inside(p,s.points)))))return "water";
  const grade=ps.some(p=>{const i=cell(p),x=i%backdrop.size,y=Math.floor(i/backdrop.size),here=backdrop.heights[i],dx=Math.abs(backdrop.heights[y*backdrop.size+Math.min(backdrop.size-1,x+1)]-here)/Math.max(1,frame.width/(backdrop.size-1)),dy=Math.abs(backdrop.heights[Math.min(backdrop.size-1,y+1)*backdrop.size+x]-here)/Math.max(1,frame.height/(backdrop.size-1));return Math.max(dx,dy)>.25;});return grade?"steep":undefined;
 };
 const density=options.density==="sparse"?1.8:options.density==="dense"?.7:1,gap=Math.max(1,Math.min(40,options.gap))*density,setback=Math.max(1.5,Math.min(30,options.setback)),sides=options.side==="both"?[-1,1]:[options.side==="left"?-1:1];
 for(const side of sides){let along=10,previous=0,index=0,sideAdded=0;const startAttempts=attempts;
  while(along<length-8&&attempts++-startAttempts<400&&sideAdded<Math.floor(200/sides.length)&&additions.length<200&&design.features.length+additions.length<TOWN_MAP_LIMITS.features){const category=categories[options.variation?Math.floor(random()*categories.length):index++%categories.length],preset=townPreset(category),size=options.size==="small"?.65:options.variation?.72+random()*.4:.9,width=preset.width*size;along+=previous/2+width/2+gap;if(along>length-width/2-3)break;const at=townRoadAtDistance(points,along),offset=road.width/2+preset.height*size/2+setback,point={x:at.point.x-Math.sin(at.angle)*offset*side,y:at.point.y+Math.cos(at.angle)*offset*side},rotation=options.face?at.angle*180/Math.PI+(side===1?180:0):0;
   const s=makeTownStamp("building",point,{...defaultTownBrush(),category,size,rotation,architecture:options.architecture},uuid());s.origin="generated";previous=width;
   if(s.points.some(p=>p.x<0||p.y<0||p.x>frame.width||p.y>frame.height)){skipped.edge++;continue;}const problem=terrain(s);if(problem){skipped[problem]++;continue;}if(occupied(s)){skipped.occupied++;continue;}if(touchesRoad(s)){skipped.road++;continue;}if(retainedPoints+s.points.length>TOWN_MAP_LIMITS.points)break;
   s.points=s.points.map(p=>({x:townRound(p.x),y:townRound(p.y)}));additions.push(s);sideAdded++;retainedPoints+=s.points.length;occupy(s);
  }
 }
 const omitted=Object.values(skipped).reduce((n,c)=>n+c,0);if(omitted)warnings.push(`${omitted} sites were skipped to avoid water, steep ground, existing objects, street surfaces or map edges.`);
 if(design.features.length+additions.length>=TOWN_MAP_LIMITS.features||retainedPoints>=TOWN_MAP_LIMITS.points)warnings.push("This arrangement fills the map's retained shape or point capacity. Additional neighborhoods can use another Town Map.");
 else if(additions.length>=200||attempts>=800)warnings.push("This preview reached its safe placement limit. Accept this section before previewing more buildings.");
 if(!additions.length)warnings.push("No suitable sites were found. Try smaller buildings, another road, or more space. Existing work is kept.");
 const next={...design,features:[...design.features,...additions]};validateTownDesign(next,frame);return {design:next,additions,warnings,skipped};
}
