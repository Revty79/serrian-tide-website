import {hydroLayerSchema,validateHydroFrame,type HydroLayer,type HydroPoint,type HydroGeometry,type HydroLake} from "./terrain-hydrology";
import {waterDx,unwrapWaterRing,waterPoint} from "./terrain-water-geometry";
import {connectedWater} from "./terrain-water-network";
import {insideWaterRings} from "./terrain-water-geometry";

export function interiorLakeSeed(rings:HydroPoint[][],world:HydroGeometry){
 const outer=unwrapWaterRing(rings[0],world),aligned=rings.map(r=>{const points=unwrapWaterRing(r,world),shift=world.wrap?Math.round((outer[0].x-points[0].x)/world.width)*world.width:0;return points.map(p=>({...p,x:p.x+shift}));});
 const ys=outer.map(p=>p.y),y=(Math.min(...ys)+Math.max(...ys))/2,xs:number[]=[];let best=0,seed:HydroPoint|undefined;
 for(const ring of aligned)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a.y>y)!==(b.y>y))xs.push(a.x+(y-a.y)/(b.y-a.y)*(b.x-a.x));}
 xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>best){best=xs[i+1]-xs[i];seed=waterPoint({x:(xs[i]+xs[i+1])/2,y},world);}
 if(!seed||!insideWaterRings(seed,rings,world))throw Error("The lake needs a usable interior water position.");return seed;
}

export function appendManualLake(layer:HydroLayer,world:HydroGeometry,input:{id:string;name:string;rings:HydroPoint[][];levelM:number;condition:HydroLake["condition"];authoredPins?:HydroLake["authoredPins"]}){
 if((layer.lakes??[]).some(l=>l.id===input.id))throw Error("This lake identity already exists. Edit the original shoreline.");
 if(input.rings.length>33||input.rings.reduce((n,r)=>n+r.length,0)>1024)throw Error("Keep this drawn lake within 1,024 total corners and 32 islands.");
 const rings=input.rings.map(r=>r.map(p=>({...p}))),outer=rings[0];
 if(!outer?.length)throw Error("Draw an outer shoreline first.");
 // Geometry validation precedes selection of an interior geographic control.
 const seed={...outer[0]};
 const lake:HydroLake={id:input.id,name:input.name.trim()||"Authored lake",rings,seed,levelM:input.levelM,spillM:null,condition:input.condition,mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],...input.authoredPins?{authoredPins:input.authoredPins}: {},review:false};
 const result=hydroLayerSchema.parse({...connectedWater(layer),lakes:[...layer.lakes??[],lake]});validateHydroFrame(result,world);
 for(let i=1;i<rings.length;i++){
  if(!insideWaterRings(rings[i][0],[rings[0]],world))throw Error("Keep island outlines inside the outer shoreline.");
  for(let j=1;j<i;j++)if(insideWaterRings(rings[i][0],[rings[j]],world)||insideWaterRings(rings[j][0],[rings[i]],world))throw Error("Keep island outlines separate and unnested.");
 }
 result.lakes!.at(-1)!.seed=interiorLakeSeed(rings,world);return result;
}

/** Creator-positioned geography, with no invented drainage analysis or discharge. */
export function appendManualWaterway(layer:HydroLayer,world:HydroGeometry,input:{id:string;name:string;points:HydroPoint[];widthM:number|null;seaOutlet:boolean}){
 const {id}=input,from=id+":source",to=id+":outlet";
 if(layer.edges.some(e=>e.id===id)||layer.nodes.some(n=>n.id===from||n.id===to))throw Error("This waterway identity already exists. Retain the original course.");
 if(input.points.length<2||input.points.length>512)throw Error("Draw from 2 to 512 river control points, in downstream order.");
 const points=input.points.map(p=>({...p})),same=(a:HydroPoint,b:HydroPoint)=>Math.hypot(waterDx(a.x,b.x,world),a.y-b.y)<1e-6;
 if(points.some((p,i)=>i>0&&same(p,points[i-1]))||same(points[0],points.at(-1)!))throw Error("Use distinct consecutive points and separate upstream and downstream ends.");
 const result=hydroLayerSchema.parse({...connectedWater(layer),
  nodes:[...layer.nodes,{id:from,point:points[0],kind:"source",elevationM:null,drainageM2:0,spillM:null},{id:to,point:points.at(-1)!,kind:input.seaOutlet?"sea-outlet":"open-end",elevationM:null,drainageM2:0,spillM:null}],
  edges:[...layer.edges,{id,from,to,name:input.name.trim()||"Authored river",points,drainageM2:0,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],widthM:input.widthM}],
 });
 validateHydroFrame(result,world);return result;
}
