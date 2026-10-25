import {z} from "zod";
import {brushWeight,type TerrainGeometry,type TerrainPatch} from "./terrain";
import {terrainAreaSchema,type TerrainArea} from "./terrain-source";

export type TerrainPathPoint={x:number;y:number};
const point=z.object({x:z.number().finite(),y:z.number().finite()}).strict();
export const terrainOperationSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.enum(["ridge","valley"]),points:z.array(point).min(2).max(256),radius:z.number().min(1).max(128),height:z.number().int().min(1).max(30000),hardness:z.number().min(0).max(1)}).strict(),
 z.object({kind:z.literal("area"),area:terrainAreaSchema,tool:z.enum(["level","smooth","raise","lower"]),target:z.number().int().min(-30000).max(30000),amount:z.number().int().min(1).max(30000),strength:z.number().min(1).max(100),passes:z.number().int().min(1).max(20),feather:z.number().int().min(0).max(32)}).strict(),
]);
export type TerrainOperation=z.infer<typeof terrainOperationSchema>;
export function validateArea(area:TerrainArea,shape:TerrainGeometry){terrainAreaSchema.parse(area);if(area.x+area.width>shape.width||area.y+area.height>shape.height)throw Error("Keep the selected rectangle inside this map's sample grid.");}
export function unwrapTerrainPath(points:TerrainPathPoint[],shape:TerrainGeometry){
 return points.reduce<TerrainPathPoint[]>((out,p)=>{const previous=out.at(-1);out.push({x:shape.wrap&&previous?p.x+Math.round((previous.x-p.x)/shape.width)*shape.width:p.x,y:p.y});return out;},[]);
}
const indexAt=(x:number,y:number,s:TerrainGeometry)=>Math.max(0,Math.min(s.height-1,y))*s.width+(s.wrap?(x%s.width+s.width)%s.width:Math.max(0,Math.min(s.width-1,x)));
const bounded=(v:number,s:TerrainGeometry)=>Math.round(Math.max(s.min,Math.min(s.max,v)));
/** Independent preview buffer; neither the caller's grid nor outside cells mutate. */
export function prepareTerrainOperation(base:Int16Array,shape:TerrainGeometry,raw:TerrainOperation,progress?:(p:number)=>void){
 const operation=terrainOperationSchema.parse(raw);if(base.length!==shape.width*shape.height)throw Error("The terrain buffer does not match this map.");
 const grid=base.slice();
 if(operation.kind==="area"){
  validateArea(operation.area,shape);if(operation.tool==="level"&&(operation.target<shape.min||operation.target>shape.max))throw Error("Choose a target elevation within this saved map's limits.");
  const a=operation.area,passes=operation.tool==="smooth"?operation.passes:1;let source=base;
  for(let pass=0;pass<passes;pass++){
   if(pass)source=grid.slice();
   for(let y=a.y;y<a.y+a.height;y++)for(let x=a.x;x<a.x+a.width;x++){
    const i=y*shape.width+x,value=source[i],edge=Math.min(x-a.x+.5,a.x+a.width-x-.5,y-a.y+.5,a.y+a.height-y-.5),t=operation.feather?Math.min(1,edge/operation.feather):1,weight=t*t*(3-2*t)*operation.strength/100;
    let target=operation.tool==="raise"?value+operation.amount:operation.tool==="lower"?value-operation.amount:operation.target;
    if(operation.tool==="smooth"){target=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)target+=source[indexAt(x+dx,y+dy,shape)];target/=9;}
    grid[i]=bounded(value+(target-value)*weight,shape);
   }
   progress?.((pass+1)/passes);
  }
 }else{
  if(operation.points.some(p=>p.x<0||p.x>=shape.width||p.y<0||p.y>=shape.height))throw Error("Keep the path's control points on this map.");
  const points=unwrapTerrainPath(operation.points,shape),weights=new Float32Array(base.length),radius=Math.min(operation.radius,shape.width/2),sign=operation.kind==="ridge"?1:-1;
  // A maximum distance field prevents intersections and short segments from
  // piling up height/depth. Each segment visits only its own bounded corridor.
  for(let n=1;n<points.length;n++){
   const a=points[n-1],b=points[n],dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
   const left=shape.wrap?Math.floor(Math.min(a.x,b.x)-radius):Math.max(0,Math.floor(Math.min(a.x,b.x)-radius)),right=shape.wrap?Math.ceil(Math.max(a.x,b.x)+radius):Math.min(shape.width-1,Math.ceil(Math.max(a.x,b.x)+radius)),top=Math.max(0,Math.floor(Math.min(a.y,b.y)-radius)),bottom=Math.min(shape.height-1,Math.ceil(Math.max(a.y,b.y)+radius));
   for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const t=length2?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length2)):0,distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy)/radius;if(distance>=1)continue;
    const i=indexAt(x,y,shape);weights[i]=Math.max(weights[i],brushWeight(distance,operation.hardness));
   }
   progress?.(n/points.length*.85);
  }
  for(let i=0;i<grid.length;i++)if(weights[i])grid[i]=bounded(base[i]+sign*operation.height*weights[i],shape);
 }
 let changed=0,minimum=Infinity,maximum=-Infinity;for(let i=0;i<grid.length;i++){if(grid[i]!==base[i])changed++;minimum=Math.min(minimum,grid[i]);maximum=Math.max(maximum,grid[i]);}
 const indices=new Uint32Array(changed),before=new Int16Array(changed),after=new Int16Array(changed);let n=0;
 for(let i=0;i<grid.length;i++)if(grid[i]!==base[i]){indices[n]=i;before[n]=base[i];after[n]=grid[i];n++;}
 const patch={indices,before,after} satisfies TerrainPatch;progress?.(1);return {grid,patch,changed,minimum,maximum};
}
