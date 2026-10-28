import {z} from "zod";

/** Presentation values only. Version 1 is the stable terrain-art-1 algorithm. */
export const terrainStyleSchema=z.object({
 version:z.literal(1),palette:z.enum(["natural","verdant","ochre","muted"]),
 land:z.string().regex(/^#[0-9a-fA-F]{6}$/),water:z.string().regex(/^#[0-9a-fA-F]{6}$/),tint:z.number().finite().min(0).max(1),
 saturation:z.number().finite().min(0).max(2),brightness:z.number().finite().min(.6).max(1.4),contrast:z.number().finite().min(.5).max(1.5),
 relief:z.number().finite().min(0).max(2),texture:z.number().finite().min(0).max(2),detail:z.number().finite().min(.25).max(2),vegetation:z.number().finite().min(0).max(2),blend:z.number().finite().min(0).max(1),ink:z.number().finite().min(0).max(2),scale:z.number().finite().min(.5).max(2),
}).strict();
export type TerrainStyle=z.infer<typeof terrainStyleSchema>;
export const DEFAULT_TERRAIN_STYLE:TerrainStyle={version:1,palette:"natural",land:"#b6ad85",water:"#286779",tint:0,saturation:1,brightness:1,contrast:1,relief:1,texture:1,detail:1,vegetation:1,blend:.8,ink:1,scale:1};
export const terrainStyle=(style?:TerrainStyle)=>style??DEFAULT_TERRAIN_STYLE;
export const ART_RENDERER_VERSION="terrain-art-1";
const compiled=new WeakMap<TerrainStyle,{land:number[];water:number[];palette:number[];saturation:number}>();
export function styleColor(rgb:readonly number[],water:boolean,style:TerrainStyle,out:number[]= [0,0,0]){
 let config=compiled.get(style);if(!config){const color=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));config={land:color(style.land),water:color(style.water),palette:style.palette==="verdant"?[.93,1.06,.92]:style.palette==="ochre"?[1.08,1,.87]:[1,1,1],saturation:style.saturation*(style.palette==="muted"?.55:1)};compiled.set(style,config);}
 const gray=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,tint=water?config.water:config.land;
 for(let c=0;c<3;c++){const value=(gray+(rgb[c]-gray)*config.saturation)*config.palette[c],color=value+(tint[c]-value)*style.tint;out[c]=Math.max(0,Math.min(255,((color-128)*style.contrast+128)*style.brightness));}return out;
}
/** Scale-aware directional lighting from saved physical gradients; no invented heights. */
let lightFootprint=NaN,lightRelief=NaN,lightEmphasis=NaN,lightGain=1;
export function artLight(gx:number,gy:number,footprint:number,relief:number,emphasis=1){
 if(footprint!==lightFootprint||relief!==lightRelief||emphasis!==lightEmphasis){lightFootprint=footprint;lightRelief=relief;lightEmphasis=emphasis;lightGain=Math.sqrt(Math.max(1,relief))*.35*(1+Math.min(9000,footprint/6))*emphasis;}
 const x=gx*lightGain,y=gy*lightGain,length=Math.sqrt(x*x+y*y+1),diffuse=(-x*.52-y*.62+.59)/length;
 return Math.max(.38,Math.min(1.3,.56+Math.max(0,diffuse)*.73));
}
