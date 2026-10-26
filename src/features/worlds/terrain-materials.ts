import {z} from "zod";
import type {TerrainGeometry} from "./terrain";

export const materialNames={rock:"Exposed rock",scree:"Gravel and scree",soil:"Soil and earth",grass:"Grassland ground cover",sand:"Sand and beach",snow:"Snow / pale highland",automatic:"Erase to automatic"} as const;
export type SurfaceMaterial=keyof typeof materialNames;
const point=z.object({x:z.number().finite().min(0).max(1e12),y:z.number().finite().min(0).max(1e12)}).strict();
export const materialStrokeSchema=z.object({id:z.string().uuid(),material:z.enum(["rock","scree","soil","grass","sand","snow","automatic"]),radiusM:z.number().finite().min(.125).max(1e12),strength:z.number().finite().min(.01).max(1),points:z.array(point).min(1).max(256)}).strict();
export const terrainMaterialsSchema=z.object({version:z.literal(1),visible:z.boolean(),opacity:z.number().finite().min(0).max(1),locked:z.boolean(),automatic:z.boolean(),strokes:z.array(materialStrokeSchema).max(4096)}).strict().superRefine((v,c)=>{if(v.strokes.reduce((n,s)=>n+s.points.length,0)>32768)c.addIssue({code:"custom",message:"This material layer has reached its 32,768 point budget. Export the draft before clearing any strokes."});if(new Set(v.strokes.map(s=>s.id)).size!==v.strokes.length)c.addIssue({code:"custom",message:"Material stroke identities must be unique."});});
export type MaterialStroke=z.infer<typeof materialStrokeSchema>;
export type TerrainMaterials=z.infer<typeof terrainMaterialsSchema>;
export const EMPTY_TERRAIN_MATERIALS:TerrainMaterials={version:1,visible:true,opacity:1,locked:false,automatic:true,strokes:[]};
export const materialSaveSchema=z.object({mapId:z.string().uuid(),revision:z.number().int().min(0),requestId:z.string().uuid(),layer:terrainMaterialsSchema}).strict();
export type MaterialCommand=z.infer<typeof materialSaveSchema>;
export function validateMaterialFrame(layer:TerrainMaterials,shape:Pick<TerrainGeometry,"displayWidth"|"displayHeight">){for(const s of layer.strokes){if(s.radiusM>Math.max(shape.displayWidth,shape.displayHeight))throw new Error("Material brush exceeds this World's physical dimensions.");for(const p of s.points)if(p.x>=shape.displayWidth||p.y>=shape.displayHeight)throw new Error("A material point is outside this map's physical frame.");}}
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function materialCoverage(stroke:MaterialStroke,x:number,y:number,period:number|null){
 let best=Infinity;const points=stroke.points;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[Math.min(i+1,points.length-1)];let dx=b.x-a.x;if(period)dx-=Math.round(dx/period)*period;const dy=b.y-a.y;
  let px=x-a.x;if(period)px-=Math.round(px/period)*period;const py=y-a.y,t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1)));
  const qx=px-t*dx,qy=py-t*dy;best=Math.min(best,qx*qx+qy*qy);if(best<=stroke.radiusM*stroke.radiusM*.65*.65)return stroke.strength;
 }
 return stroke.strength*smooth((1-Math.sqrt(best)/stroke.radiusM)/.35);
}
/** One physical vector coverage applies at every numerical resolution. Ordered erase
 * strokes restore the current automatic interpretation, never numerical heights. */
export function paintMaterialWeights(weights:number[],layer:Pick<TerrainMaterials,"visible"|"opacity">,strokes:MaterialStroke[],x:number,y:number,period:number|null){
 const original=weights.slice();if(!layer.visible)return weights;weights.fill(0);let remaining=1;
 for(let n=strokes.length-1;n>=0&&remaining>0;n--){const stroke=strokes[n],t=materialCoverage(stroke,x,y,period)*layer.opacity;if(!t)continue;const index=["rock","scree","soil","grass","sand","snow"].indexOf(stroke.material);for(let i=0;i<6;i++)weights[i]+=(index<0?original[i]:i===index?1:0)*t*remaining;remaining*=1-t;}
 for(let i=0;i<6;i++)weights[i]+=original[i]*remaining;return weights;
}
