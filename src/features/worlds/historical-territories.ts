import { z } from "zod";
import { validateGeometry } from "./atlas-geometry";
import { yearSchema } from "./world-year";

const id = z.string().uuid(), name = z.string().trim().min(1).max(160);
const vertex = z.object({id, x:z.number().finite(), y:z.number().finite()}).strict();
export const territoryFamilies = ["polity","government","institution","claim","agreement","conflict","realm","civilization"] as const;
export const territoryRoles = {control:"Established control",claim:"Independent claim",administration:"Administration",occupation:"Occupation",other:"Other authored relationship"} as const;
export const territoryCoverage = {authored:"Authored political account",contested:"Contested / overlapping accounts",unclaimed:"Explicitly unclaimed",unknown:"Unknown political coverage"} as const;
export const territoryBoundarySchema = z.object({id, parentId:id.nullable(), archived:z.boolean(), points:z.array(vertex).min(3).max(256)}).strict();
export const territoryRelationshipSchema = z.object({id,entityId:id,versionId:id,revision:z.number().int().positive(),entityName:name,family:z.enum(territoryFamilies),role:z.enum(["control","claim","administration","occupation","other"]),roleLabel:z.string().max(160),startYear:yearSchema,endYear:yearSchema,account:z.string().max(12000)}).strict();
export const territorySchema = z.object({id,name,archived:z.boolean(),protected:z.boolean(),coordinateSpace:z.literal("atlas-v1"),coverage:z.enum(["authored","contested","unclaimed","unknown"]),geographyIds:z.array(id).max(20),account:z.string().trim().min(1,"Explain the source or uncertainty of this territorial account.").max(12000),accountYear:yearSchema.nullable(),originalNotation:z.string().max(4000),boundaries:z.array(territoryBoundarySchema).max(128),relationships:z.array(territoryRelationshipSchema).max(20),history:z.array(z.object({entityId:id,versionId:id,name}).strict()).max(20)}).strict();
export const territoriesSchema = z.array(territorySchema).max(128);
export type HistoricalTerritory = z.infer<typeof territorySchema>;
export type TerritoryBoundary = z.infer<typeof territoryBoundarySchema>;
export type TerritoryReferences = {entities:Pick<HistoricalTerritory["relationships"][number],"entityId"|"versionId"|"revision"|"entityName"|"family">[];history:HistoricalTerritory["history"]};
export function emptyTerritory():HistoricalTerritory {return {id:crypto.randomUUID(),name:"New territory",archived:false,protected:false,coordinateSpace:"atlas-v1",coverage:"unknown",geographyIds:[],account:"",accountYear:null,originalNotation:"",boundaries:[],relationships:[],history:[]};}
function ringsCross(a:TerritoryBoundary["points"],b:TerritoryBoundary["points"]){
  const cross=(p:{x:number;y:number},q:{x:number;y:number},r:{x:number;y:number})=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const on=(p:{x:number;y:number},q:{x:number;y:number},r:{x:number;y:number})=>Math.abs(cross(p,q,r))<1e-8&&r.x>=Math.min(p.x,q.x)&&r.x<=Math.max(p.x,q.x)&&r.y>=Math.min(p.y,q.y)&&r.y<=Math.max(p.y,q.y);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0||on(p,q,r)||on(p,q,s)||on(r,s,p)||on(r,s,q))return true;}
  return false;
}
export function ringContains(outer:TerritoryBoundary["points"],inner:TerritoryBoundary["points"]){
  const cross=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(const p of inner){let inside=false;for(let i=0,j=outer.length-1;i<outer.length;j=i++){const a=outer[i],b=outer[j];if(Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y))return false;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(!inside)return false;}
  return !ringsCross(outer,inner);
}
export function validateTerritories(territories:HistoricalTerritory[],period?:{startYear:number;endYear:number}) {
  territoriesSchema.parse(territories);
  const ids = new Set<string>(); let rings=0,points=0;
  function distinct(value:string){if(ids.has(value))throw new Error("Territories, boundaries and relationships keep distinct identities.");ids.add(value);}
  for(const t of territories){distinct(t.id);if(new Set(t.geographyIds).size!==t.geographyIds.length||new Set(t.history.map(h=>h.entityId)).size!==t.history.length)throw new Error("Keep each saved place and History citation once per territory.");
    if((t.coverage==="unknown"||t.coverage==="unclaimed")&&t.relationships.length)throw new Error("Unknown or unclaimed territory does not establish a political relationship. Choose an authored or contested account.");
    for(const b of t.boundaries){distinct(b.id);rings++;points+=b.points.length;validateGeometry({version:1,type:"polygon",points:b.points});if(b.parentId){const outer=t.boundaries.find(n=>n.id===b.parentId);if(!outer||outer.parentId||outer.id===b.id)throw new Error("A hole belongs to an outer boundary of this territory.");if(!b.archived&&outer.archived)throw new Error("Archive a boundary's holes with its outer boundary.");if(!b.archived&&!ringContains(outer.points,b.points))throw new Error("An enclave hole must lie strictly inside its containing boundary.");}}
    const holes=t.boundaries.filter(b=>!b.archived&&b.parentId);
    for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++)if(holes[i].parentId===holes[j].parentId&&(ringsCross(holes[i].points,holes[j].points)||ringContains(holes[i].points,holes[j].points)||ringContains(holes[j].points,holes[i].points)))throw new Error("Enclave holes within the same boundary must not overlap or touch. Draw their combined outline instead.");
    for(const r of t.relationships){distinct(r.id);if(r.endYear<r.startYear||period&&(r.startYear<period.startYear||r.endYear>period.endYear))throw new Error("Political relationship periods are inclusive and must remain within this appearance's period.");if(r.role==="other"&&!r.roleLabel.trim())throw new Error("Describe the original political relationship.");}
  }
  if(rings>128||points>8192)throw new Error("A political overlay supports 128 boundary rings and 8,192 vertices.");
}
export function territoryPath(t:HistoricalTerritory){return t.boundaries.filter(b=>!b.archived&&(!b.parentId||!t.boundaries.find(p=>p.id===b.parentId)?.archived)).map(b=>`M ${b.points.map(p=>`${p.x} ${p.y}`).join(" L ")} Z`).join(" ");}
export function activeTerritoryRelationships(t:HistoricalTerritory,year?:number|null){return t.relationships.filter(r=>year==null||r.startYear<=year&&r.endYear>=year);}
