import "server-only";
import {createHash} from "node:crypto";
import {and,eq,isNull} from "drizzle-orm";
import {db} from "@/db";
import {worldHydrology} from "@/db/world-hydrology-schema";
import {worldMapPlace} from "@/db/world-town-schema";
import {worldGeography} from "@/db/world-atlas-schema";
import type {HydroPoint} from "./terrain-hydrology";
import type {LabelCandidate,LabelSource,MapLabel} from "./terrain-labels";

/** Read existing accepted names/positions only. No geographic identity is created. */
export async function labelSourceCatalog(tx:Pick<typeof db,"select">,worldId:string,mapId:string){
 const catalog=new Map<string,LabelCandidate>();
 function add(kind:LabelSource["kind"],id:string,name:string,anchor:HydroPoint,path:HydroPoint[],labelKind:MapLabel["kind"]){
  if(!name.trim()||!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))return;
  const source:LabelSource={kind,id,mapId,name,fingerprint:createHash("sha256").update(JSON.stringify([kind,id,name,[anchor.x,anchor.y],path.map(p=>[p.x,p.y])])).digest("hex")};
  catalog.set(kind+":"+id,{key:kind+":"+id,source,anchor:{x:anchor.x,y:anchor.y},path:path.map(p=>({x:p.x,y:p.y})),kind:labelKind});
 }
 const [water]=await tx.select().from(worldHydrology).where(and(eq(worldHydrology.mapId,mapId),eq(worldHydrology.worldId,worldId)));
 for(const edge of water?.layer.edges??[])add("river",edge.id,edge.name,edge.points[Math.floor(edge.points.length/2)],edge.points,"river");
 for(const lake of water?.layer.lakes??[])if(lake.condition!=="potential")add("lake",lake.id,lake.name,lake.seed,[],"lake");
 for(const feature of water?.layer.features??[]){const p=feature.kind==="wetland"?feature.rings[0]?.[0]:feature.point;if(feature.kind!=="wetland"||feature.classification!=="potential")add("feature",feature.id,feature.name,p,[],"landmark");}
 for(const catchment of water?.layer.catchments??[])add("catchment",catchment.id,catchment.name,catchment.outlet,[],"region");
 const towns=await tx.select({id:worldGeography.id,name:worldGeography.name,x:worldMapPlace.x,y:worldMapPlace.y}).from(worldMapPlace).innerJoin(worldGeography,and(eq(worldGeography.id,worldMapPlace.geographyId),eq(worldGeography.worldId,worldMapPlace.worldId))).where(and(eq(worldMapPlace.worldId,worldId),eq(worldMapPlace.mapId,mapId),isNull(worldMapPlace.removedAt),isNull(worldGeography.archivedAt))).limit(2048);
 for(const town of towns)add("town",town.id,town.name,{x:town.x,y:town.y},[],"town");
 return new Map([...catalog].sort(([a],[b])=>a.localeCompare(b)));
}
