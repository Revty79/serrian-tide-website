import {ARTWORK_LIMITS,artworkPack,type ArtworkLayer,type ArtworkPlacement} from "./terrain-artwork";
import type {TerrainViewport} from "./terrain-refinement";
import type {SurfaceField} from "./terrain-surface-field";
import type {EnvironmentSample} from "./terrain-environment-sample";
import type {HydroGeometry} from "./terrain-hydrology";
import {terrainStyle,type TerrainStyle} from "./terrain-style";
export type ArtworkContext={world:HydroGeometry;sea:number;sample:(x:number,y:number)=>SurfaceField;environment:(x:number,y:number)=>EnvironmentSample|undefined;water:(x:number,y:number)=>"water"|"wetland"|null};
export function artworkHash(x:number,y:number,seed:number){let n=Math.imul(x^seed,0x45d9f3b)^Math.imul(y+1987,0x27d4eb2d);n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
export function artworkSeed(value:string){let n=2166136261;for(let i=0;i<value.length;i++)n=Math.imul(n^value.charCodeAt(i),16777619);return n>>>0;}
/** Lattice is canonical to World metres, never viewport pixels. Level changes
 * replace sparse clusters predictably; there is no per-tile random state. */
export function planArtwork(layer:ArtworkLayer,view:TerrainViewport,context:ArtworkContext,style:string,art?:TerrainStyle){
 const s=terrainStyle(art),world=context.world,seed=artworkSeed(layer.seed),pack=artworkPack(layer,style),placements:ArtworkPlacement[]=[];
 const span=Math.max(.00001,view.right-view.left),desired=Math.max(.25,span/12/s.detail*s.scale),level=Math.max(0,Math.min(32,Math.floor(Math.log2(world.width/desired)))),cols=2**level,step=world.width/cols;
 let candidates=0;
 if(!layer.automatic||layer.density===0||layer.opacity===0)return {placements,candidates,level,step};
 const center=(view.left+view.right)/2,turn=world.wrap?Math.floor(center/world.width):0,left=world.wrap?Math.max(-world.width,view.left-turn*world.width):Math.max(0,view.left),right=world.wrap?Math.min(2*world.width,view.right-turn*world.width):Math.min(world.width,view.right),top=Math.max(0,view.top),bottom=Math.min(world.height,view.bottom),seen=new Set<string>();
 const minX=Math.max(0,Math.floor(left/step)-1),maxX=Math.min(cols-1,Math.floor(right/step)+1),minY=Math.max(0,Math.floor(top/step)-1),maxY=Math.min(Math.ceil(world.height/step)-1,Math.floor(bottom/step)+1);
 // Wrapped views that cross a seam need cells on both ends, but never multiple
 // copies of an enormous unbounded viewport or repeated canonical candidates.
 const ranges=world.wrap&&left<0?[[0,maxX],[Math.max(0,cols+Math.floor(left/step)-1),cols-1]]:world.wrap&&right>world.width?[[minX,cols-1],[0,Math.min(cols-1,Math.floor((right-world.width)/step)+1)]]:[[minX,maxX]];
 outer:for(let y=minY;y<=maxY;y++)for(const [lo,hi] of ranges)for(let x=lo;x<=hi;x++){
  const id=x+":"+y;if(seen.has(id))continue;seen.add(id);if(++candidates>ARTWORK_LIMITS.automaticCandidates)break outer;
  const r=artworkHash(x,y,seed),cluster=artworkHash(Math.floor(x/3),Math.floor(y/3),seed+19);if(r>layer.density*(.18+cluster*.4))continue;
  const px=(x+.35+artworkHash(x,y,seed+7)*.3)*step,py=(y+.35+artworkHash(x,y,seed+13)*.3)*step;if(px>=world.width||py>world.height)continue;
  const f=context.sample(px,py),height=f.height,wet=context.water(px,py),underwater=f.waterHeight<=context.sea||wet==="water",e=context.environment(px,py),slope=Math.hypot(f.gx,f.gy);let motif:string|undefined;
  if(underwater){if(r<.12&&height<context.sea-3)motif="waves";}
  else if(wet==="wetland"||e?.biome==="wetland")motif=r<.2?"reeds":"marsh";
  else if(e?.biome==="ice"||e&&e.temperature<-4&&height>context.sea+400)motif=r<.25?"ice":"snow";
  else if(height>context.sea+700&&(slope>.008||f.rough>.025))motif=height>context.sea+1800?"summit":"range";
  else if(slope>.16)motif="cliff";
  else if(e&&e.density>.2&&s.vegetation>0&&r<Math.min(1,e.density*s.vegetation))motif=e.vegetation==="conifer"?"conifer":e.vegetation==="tropical"?"tropical":e.vegetation==="savanna"?"savanna":e.vegetation==="woodland"?"woodland":e.woody>.3?"deciduous":undefined;
  if(!motif&&!underwater&&e){if(e.biome==="hotDesert")motif=r<.15?"badlands":"dunes";else if(e.biome==="coldDesert"||e.biome==="tundra"||e.biome==="alpine")motif=r<.15?"rocks":"alpine";else if(e.vegetation==="scrub")motif="scrub";else if(["grassland","meadow","steppe"].includes(e.biome)&&r<.2)motif="meadow";}
  if(!motif&&!underwater&&height>context.sea+250&&slope>.006)motif="hills";
  if(!motif)continue;
  const widthM=step*(.50+artworkHash(x,y,seed+23)*.16),edge=widthM*.4;
  // Dry silhouettes are withheld at mixed coasts/lake edges, not painted over water.
  if(!underwater&&[[-edge,0],[edge,0],[0,-edge],[0,edge]].some(([dx,dy])=>{const xx=world.wrap?((px+dx)%world.width+world.width)%world.width:px+dx,yy=py+dy;return xx<0||xx>=world.width||yy<0||yy>world.height||context.sample(xx,yy).waterHeight<=context.sea||context.water(xx,yy)==="water";}))continue;
  placements.push({id:`auto:${level}:${id}`,assetId:`${pack}.${motif}.v1`,assetVersion:1,x:px,y:py,widthM,rotation:motif==="waves"?0:(artworkHash(x,y,seed+31)-.5)*10,opacity:(.42+r*.28)*(style==="illustrated-fantasy"?1:.8),mirror:artworkHash(x,y,seed+43)>.5});
  if(placements.length>=ARTWORK_LIMITS.automaticDraws)break outer;
 }
 return {placements,candidates,level,step};
}
