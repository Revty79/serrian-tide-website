import {hydroLayerSchema,validateHydroFrame,type HydroLayer,type HydroPoint,type HydroGeometry} from "./terrain-hydrology";
import {waterDx} from "./terrain-water-geometry";
import {connectedWater} from "./terrain-water-network";

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
