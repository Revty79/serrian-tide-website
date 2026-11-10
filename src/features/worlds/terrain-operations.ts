import {advancedOperationOptions} from "./terrain-advanced-spec";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {z} from "zod";
import {physicalBrushGeometry} from "./terrain-physical-brush";
import {brushWeight,type TerrainGeometry,type TerrainPatch} from "./terrain";
import {terrainAreaSchema,type TerrainArea} from "./terrain-source";
import {terrainPolygonSelection} from "./terrain-polygon-selection";

export type TerrainPathPoint={x:number;y:number};
const point=z.object({x:z.number().finite(),y:z.number().finite()}).strict();
const heightFilter=z.object({mode:z.enum(["above","at-or-below"]),level:z.number().int().min(-30000).max(30000)}).strict().optional();
export const terrainOperationSchema=z.discriminatedUnion("kind",[
 ...advancedOperationOptions,
 z.object({kind:z.enum(["ridge","valley"]),points:z.array(point).min(2).max(256),radius:z.number().min(1).max(128),radiusMetres:z.number().finite().positive().max(1e9).optional(),height:z.number().int().min(1).max(30000),target:z.number().int().min(-30000).max(30000).optional(),hardness:z.number().min(0).max(1),heightFilter}).strict(),
 z.object({kind:z.literal("area"),area:terrainAreaSchema,tool:z.enum(["level","smooth","raise","lower","minimum","maximum"]),target:z.number().int().min(-30000).max(30000),amount:z.number().int().min(1).max(30000),strength:z.number().min(1).max(100),passes:z.number().int().min(1).max(20),feather:z.number().int().min(0).max(32),heightFilter}).strict(),
 z.object({kind:z.literal("polygon-area"),points:z.array(point).min(3).max(256),holes:z.array(z.array(point).min(3).max(256)).max(32).optional(),tool:z.enum(["level","smooth","raise","lower","minimum","maximum"]),target:z.number().int().min(-30000).max(30000),amount:z.number().int().min(1).max(30000),strength:z.number().min(1).max(100),passes:z.number().int().min(1).max(20),feather:z.number().int().min(0).max(32),heightFilter}).strict(),
]);
export type TerrainOperation=z.infer<typeof terrainOperationSchema>;
export function validateArea(area:TerrainArea,shape:TerrainGeometry){terrainAreaSchema.parse(area);if(area.x+area.width>shape.width||area.y+area.height>shape.height)throw Error("Keep the selected rectangle inside this map's sample grid.");}
export function unwrapTerrainPath(points:TerrainPathPoint[],shape:TerrainGeometry){
 return points.reduce<TerrainPathPoint[]>((out,p)=>{const previous=out.at(-1);out.push({x:shape.wrap&&previous?p.x+Math.round((previous.x-p.x)/shape.width)*shape.width:p.x,y:p.y});return out;},[]);
}
const indexAt=(x:number,y:number,s:TerrainGeometry)=>Math.max(0,Math.min(s.height-1,y))*s.width+(s.wrap?(x%s.width+s.width)%s.width:Math.max(0,Math.min(s.width-1,x)));
const bounded=(v:number,s:TerrainGeometry)=>Math.round(Math.max(s.min,Math.min(s.max,v)));
/** Independent preview buffer; neither the caller's grid nor outside cells mutate. */
export function* terrainOperationSteps(base:Int16Array,shape:TerrainGeometry,raw:TerrainOperation,progress?:(p:number)=>void,blocked?:Uint8Array,advancedContext?:AdvancedTerrainContext,manual?:Uint8Array){
 const operation=terrainOperationSchema.parse(raw);if(base.length!==shape.width*shape.height)throw Error("The terrain buffer does not match this map.");
 if("selection" in operation){if(!advancedContext)throw Error("An advanced operation requires its accepted geographic context.");const r=prepareAdvancedTerrain(base,shape,operation,advancedContext,blocked,manual,progress);return {...r,...r.metrics};}
 const grid=base.slice(),filter=operation.heightFilter,eligible=(i:number)=>!filter||(filter.mode==="above"?base[i]>filter.level:base[i]<=filter.level);
 if(operation.kind==="area"||operation.kind==="polygon-area"){
  const polygon=operation.kind==="polygon-area"?terrainPolygonSelection(operation.points,shape,operation.holes):undefined;
  if(operation.kind==="area")validateArea(operation.area,shape);if(["level","minimum","maximum"].includes(operation.tool)&&(operation.target<shape.min||operation.target>shape.max))throw Error("Choose a target elevation within this saved map's limits.");
  const a=operation.kind==="area"?operation.area:polygon!.area,edgeDistances=polygon&&operation.feather?polygon.interiorDistances(operation.feather):undefined,passes=operation.tool==="smooth"?operation.passes:1;if(a.width*a.height>1048576)throw Error("Select at most 1,048,576 samples for one terrain operation. Use a smaller area; accepted terrain is unchanged.");let source=base;
  for(let pass=0;pass<passes;pass++){
   if(pass){if(source===base)source=base.slice();for(let y=a.y;y<a.y+a.height;y++){for(let x=a.x;x<a.x+a.width;x++){const i=polygon?indexAt(x,y,shape):y*shape.width+x;source[i]=grid[i];}if(y%8===0)yield pass/passes*.75;}}
   for(let y=a.y;y<a.y+a.height;y++){for(let x=a.x;x<a.x+a.width;x++){
    if(polygon&&!polygon.mask[(y-a.y)*a.width+x-a.x])continue;
    const i=polygon?indexAt(x,y,shape):y*shape.width+x,value=source[i],edge=polygon?edgeDistances?.[(y-a.y)*a.width+x-a.x]??0:Math.min(x-a.x+.5,a.x+a.width-x-.5,y-a.y+.5,a.y+a.height-y-.5),t=operation.feather?Math.min(1,edge/operation.feather):1,weight=t*t*(3-2*t)*operation.strength/100;
    if(blocked?.[i]||!eligible(i))continue;
    let target=operation.tool==="raise"?value+operation.amount:operation.tool==="lower"?value-operation.amount:operation.tool==="minimum"?Math.max(value,operation.target):operation.tool==="maximum"?Math.min(value,operation.target):operation.target;
    if(operation.tool==="smooth"){target=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)target+=source[indexAt(x+dx,y+dy,shape)];target/=9;}
    grid[i]=bounded(value+(target-value)*weight,shape);
   }if(y%8===0)yield(pass+(y-a.y)/a.height)/passes*.75;}
   yield(pass+1)/passes*.75;
  }
 }else{
  if(operation.target!==undefined&&(operation.target<shape.min||operation.target>shape.max))throw Error("Choose a target elevation within this saved map's limits.");
  if(operation.points.some(p=>p.x<0||p.x>=shape.width||p.y<0||p.y>=shape.height))throw Error("Keep the path's control points on this map.");
  const physical=operation.radiusMetres===undefined?null:physicalBrushGeometry(shape,operation.radiusMetres,128);if(operation.radiusMetres!==undefined&&!physical)throw Error("The requested physical width is below practical sample spacing or above the bounded landform width. Choose an explicit supported width.");
  const points=unwrapTerrainPath(operation.points,shape),weights=new Float32Array(base.length),radius=physical?.x??Math.min(operation.radius,shape.width/2),radiusY=physical?.y??radius,sign=operation.kind==="ridge"?1:-1;
  // A maximum distance field prevents intersections and short segments from
  // piling up height/depth. Each segment visits only its own bounded corridor.
  for(let n=1;n<points.length;n++){
   const a=points[n-1],b=points[n],dx=b.x-a.x,dy=b.y-a.y,mx=physical?.spacing.x??1,my=physical?.spacing.y??1,length2=dx*dx*mx*mx+dy*dy*my*my;
   const left=shape.wrap?Math.floor(Math.min(a.x,b.x)-radius):Math.max(0,Math.floor(Math.min(a.x,b.x)-radius)),right=shape.wrap?Math.ceil(Math.max(a.x,b.x)+radius):Math.min(shape.width-1,Math.ceil(Math.max(a.x,b.x)+radius)),top=Math.max(0,Math.floor(Math.min(a.y,b.y)-radiusY)),bottom=Math.min(shape.height-1,Math.ceil(Math.max(a.y,b.y)+radiusY));
   for(let y=top;y<=bottom;y++){for(let x=left;x<=right;x++){
    const t=length2?Math.max(0,Math.min(1,((x-a.x)*dx*mx*mx+(y-a.y)*dy*my*my)/length2)):0,distance=physical?Math.hypot((x-a.x-t*dx)*mx,(y-a.y-t*dy)*my)/physical.metres:Math.hypot(x-a.x-t*dx,y-a.y-t*dy)/radius;if(distance>=1)continue;
    const i=indexAt(x,y,shape);weights[i]=Math.max(weights[i],brushWeight(distance,operation.hardness));
   }if(y%8===0)yield(n-1+(y-top)/Math.max(1,bottom-top))/(points.length-1)*.6;}
   yield n/points.length*.6;
  }
  for(let offset=0;offset<grid.length;offset+=32768){for(let i=offset;i<Math.min(grid.length,offset+32768);i++)if(weights[i]&&!blocked?.[i]&&eligible(i)){
   // An explicit bound approaches one elevation without piling height onto an
   // already higher ridge (or cutting an already deeper valley).
   const delta=operation.target===undefined?sign*operation.height:operation.kind==="ridge"?Math.max(0,operation.target-base[i]):Math.min(0,operation.target-base[i]);
   grid[i]=bounded(base[i]+delta*weights[i],shape);
  }yield .6+offset/grid.length*.15;}
 }
 let changed=0,minimum=Infinity,maximum=-Infinity;for(let offset=0;offset<grid.length;offset+=32768){for(let i=offset;i<Math.min(grid.length,offset+32768);i++){if(grid[i]!==base[i])changed++;minimum=Math.min(minimum,grid[i]);maximum=Math.max(maximum,grid[i]);}yield .75+offset/grid.length*.1;}if(changed>1048576)throw Error("This proposal exceeds 1,048,576 changed samples. Use a shorter path or smaller area; accepted terrain is unchanged.");
 const indices=new Uint32Array(changed),before=new Int16Array(changed),after=new Int16Array(changed);let n=0;
 for(let offset=0;offset<grid.length;offset+=32768){for(let i=offset;i<Math.min(grid.length,offset+32768);i++)if(grid[i]!==base[i]){indices[n]=i;before[n]=base[i];after[n]=grid[i];n++;}yield .85+offset/grid.length*.15;}
 const patch={indices,before,after} satisfies TerrainPatch;yield 1;return {grid,patch,changed,minimum,maximum};
}

export function prepareTerrainOperation(base:Int16Array,shape:TerrainGeometry,raw:TerrainOperation,progress?:(p:number)=>void,blocked?:Uint8Array,context?:AdvancedTerrainContext,manual?:Uint8Array){const steps=terrainOperationSteps(base,shape,raw,undefined,blocked,context,manual);let next=steps.next();while(!next.done){progress?.(next.value);next=steps.next();}return next.value;}
export async function prepareTerrainOperationAsync(base:Int16Array,shape:TerrainGeometry,raw:TerrainOperation,progress?:(p:number)=>void,blocked?:Uint8Array,context?:AdvancedTerrainContext,manual?:Uint8Array,signal?:AbortSignal){if("selection"in raw){if(!context)throw Error("This advanced operation has no accepted context.");const result=await prepareAdvancedTerrainAsync(base,shape,raw,context,blocked,manual,progress,signal);return{...result,...result.metrics};}const steps=terrainOperationSteps(base,shape,raw,undefined,blocked,context,manual);let next=steps.next(),deadline=performance.now()+8;while(!next.done){if(signal?.aborted)throw new DOMException("Numerical proposal cancelled before acceptance.","AbortError");progress?.(next.value);if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}next=steps.next();}return next.value;}
