import {insideWaterRings} from "./terrain-water-geometry";
import {townToWorld,worldToTown,type TownFrame,type TownBackdrop} from "./town-map";
import type {HydroLayer,HydroSources} from "./terrain-hydrology";
export type TownBackdropSample={elevation:number;spacingX:number;spacingY:number};
export function townBackdropPoints(frame:TownFrame,world:HydroSources["world"]){const size=17;return Array.from({length:size*size},(_,i)=>townToWorld({x:i%size/(size-1)*frame.width,y:Math.floor(i/size)/(size-1)*frame.height},frame,world));}
/** Shared accepted 17 by 17 sampling presentation. Neither caller changes
 * numerical terrain, interpolation, water geometry or the existing bounds. */
export function buildTownBackdrop(frame:TownFrame,water:{layer:HydroLayer;sources:HydroSources},samples:TownBackdropSample[],fingerprint:string):TownBackdrop{
 const sources=water.sources,world=sources.world,size=17,ps=townBackdropPoints(frame,world);
 if(samples.length!==ps.length)throw Error("Retain the complete bounded Town ground sample grid.");
 const overlaps=(ps:{x:number;y:number}[],margin=0)=>ps.some(p=>p.x>=-margin&&p.y>=-margin&&p.x<=frame.width+margin&&p.y<=frame.height+margin)||Math.min(...ps.map(p=>p.x))<=frame.width+margin&&Math.max(...ps.map(p=>p.x))>=-margin&&Math.min(...ps.map(p=>p.y))<=frame.height+margin&&Math.max(...ps.map(p=>p.y))>=-margin;
 const lines:NonNullable<TownBackdrop["water"]>["lines"]=[],lakes:NonNullable<TownBackdrop["water"]>["lakes"]=[];for(const edge of water.layer.edges){for(let i=1;i<edge.points.length&&lines.length<4096;i++){const points=[worldToTown(edge.points[i-1],frame,world),worldToTown(edge.points[i],frame,world)],width=Math.max(2,edge.widthM??8);if(world.wrap&&Math.abs(points[1].x-points[0].x)>world.width/2)continue;if(overlaps(points,width))lines.push({points,width});}}for(const lake of water.layer.lakes??[]){const rings=lake.rings.map(r=>r.map(p=>worldToTown(p,frame,world)));if(lakes.flat(2).length+rings.flat().length<=8192&&overlaps(rings.flat())&&(!world.wrap||Math.max(...rings.flat().map(p=>p.x))-Math.min(...rings.flat().map(p=>p.x))<=world.width/2))lakes.push(rings);}

 const spacing=Math.max(...samples.map(s=>Math.max(s.spacingX,s.spacingY))),warnings=[`Ground is sampled from accepted World terrain at approximately ${Math.round(spacing)} m source spacing. Town detail is an editable drawing, not a new heightmap.`,`Terrain and water checks use a bounded 17 × 17 sample grid; review small streams and slopes visually.`];
 return {...world,seaLevel:sources.seaLevel,fingerprint,spacing,size,water:{lines,lakes},heights:samples.map(p=>p.elevation),wet:samples.map((p,i)=>p.elevation<sources.seaLevel||(water.layer.lakes??[]).some(l=>insideWaterRings(ps[i],l.rings,world))||lines.some(l=>{const a=l.points[0],b=l.points[1],p={x:i%size/(size-1)*frame.width,y:Math.floor(i/size)/(size-1)*frame.height},dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=l.width/2;})),warnings};
}
