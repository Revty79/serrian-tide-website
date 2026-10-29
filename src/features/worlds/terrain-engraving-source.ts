import type {EnvironmentArtSource} from "./terrain-environment-worker-protocol";
import {terrainSurfaceSampler,surfaceFieldWork} from "./terrain-surface-field";
import {environmentSampler,environmentSampleWork} from "./terrain-environment-sample";
import {environmentalWaterIndex} from "./terrain-environment-water";
import {environmentalPalette} from "./terrain-environment-art";
import {materialCoverage,type MaterialStroke} from "./terrain-materials";
import {waterDx} from "./terrain-water-geometry";
import type {EngravingStyle} from "./terrain-engraving";

export type EngravingSource=EnvironmentArtSource&{engraving:EngravingStyle};
/** Shared immutable numerical/biome adapters; no geographic classification is written. */
export function engravingSource(source:EngravingSource){
 const t=source.terrain,world={width:t.world.displayWidth,height:t.world.displayHeight,wrap:t.world.wrap},tiles=new Map(t.tiles.map(v=>[`${v.id}/${v.revision}/${v.lod}/${v.key}`,v]));
 const sample=terrainSurfaceSampler(t.root,t.world,{plans:t.plans,active:t.active,preview:t.preview,cache:{peek:(id,revision,lod,key)=>tiles.get(`${id}/${revision}/${lod}/${key}`)},tick:0});
 const environment=environmentSampler(source.layer,world,environmentalPalette),water=environmentalWaterIndex(source.water,world),field=surfaceFieldWork(),env=environmentSampleWork();
 const bins=new Map<number,{s:MaterialStroke;i:number}[]>(),wide:{s:MaterialStroke;i:number}[]=[],layer=source.materials;
 const cell=(x:number,y:number)=>Math.max(0,Math.min(31,Math.floor(y/world.height*32)))*32+Math.max(0,Math.min(31,Math.floor(x/world.width*32)));
 if(layer.visible)layer.strokes.forEach((s,i)=>{let x=s.points[0].x,left=x,right=x,top=Infinity,bottom=-Infinity;for(let p=0;p<s.points.length;p++){if(p)x+=waterDx(s.points[p-1].x,s.points[p].x,world);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,s.points[p].y);bottom=Math.max(bottom,s.points[p].y);}left-=s.radiusM;right+=s.radiusM;top-=s.radiusM;bottom+=s.radiusM;const keys=new Set<number>();for(const offset of world.wrap?[-world.width,0,world.width]:[0]){if(right+offset<0||left+offset>world.width)continue;const a=cell(left+offset,top),b=cell(right+offset,bottom);for(let y=Math.floor(a/32);y<=Math.floor(b/32);y++)for(let x=a%32;x<=b%32;x++)keys.add(y*32+x);}const entry={s,i};if(keys.size>64)wide.push(entry);else for(const key of keys){const list=bins.get(key)??[];list.push(entry);bins.set(key,list);}});
 const weights=new Float32Array(6),names=["rock","scree","soil","grass","sand","snow"];
 return {source,world,sample,environment,water,field,env,materials:(x:number,y:number)=>{weights.fill(0);const list=bins.get(cell(x,y))??[];let a=list.length-1,b=wide.length-1,remaining=1;while((a>=0||b>=0)&&remaining>.001){const e=a>=0&&(b<0||list[a].i>wide[b].i)?list[a--]:wide[b--],amount=materialCoverage(e.s,x,y,world.wrap?world.width:null)*layer.opacity,index=names.indexOf(e.s.material);if(index>=0)weights[index]+=amount*remaining;remaining*=1-amount;}return weights;}};
}
export type EngravingArtist=ReturnType<typeof engravingSource>;
