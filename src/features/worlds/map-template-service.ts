import { templateWorldScope } from "./world-asset-permissions";
import { worldProtectedContent,worldContentEditor,worldScopeAllowed,lockWorldForWrite } from "./world-access-service";
import "server-only";
import {checkTemplateSourceRead,retainSavedTemplateSources} from "./source-rights-template";
import {redactUnderground} from "./underground";
import {preservePrivateCreatorNotes} from "./world-content-projection";
import {worldMapStyle} from "@/db/world-map-style-schema";
import {captureStyleSpec} from "./terrain-style-preset";
import {mapAppearanceSchema} from "./terrain-appearance";
import {createHash,randomUUID} from "node:crypto";
import {and,asc,desc,eq,ilike,sql} from "drizzle-orm";
import {db} from "@/db";
import {user} from "@/db/auth-schema";
import {atlasTemplate as templates,atlasTemplateVersion as versions,atlasTemplateOperation as operations,atlasTemplateAssetUsage as assetUsage} from "@/db/world-template-schema";
import {atlasAsset,atlasAssetVersion} from "@/db/world-asset-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {builtInTemplate,builtInTemplateMetadata} from "./map-template-catalogue";
import {artworkAsset} from "./terrain-artwork-assets";
import {TEMPLATE_LIMITS,templateCommandSchema,portableTemplate,validateTemplate,type MapTemplate,type TemplateFamily,type TemplateLibrary,type TemplateMetadata} from "./map-templates";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const absent=()=>new WorldError("This private template is unavailable.",404);
export async function templatesAvailable(tx:Pick<Tx,"execute">=db){return !!(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.atlas_template') is not null and to_regclass('public.atlas_template_version') is not null ok`)).rows[0].ok;}
function readableTemplateVersion(worldId:string){return worldProtectedContent(worldId)?undefined:sql`(${versions.snapshot}->'content'->>'family'<>'underground' or not exists(select 1 from jsonb_each(coalesce(${versions.snapshot}->'content'->'drawing'->'design'->'attributes','{}'::jsonb)) a where coalesce(a.value->>'visibility','ordinary')<>'ordinary'))`;}
function legacyStyle(row:typeof worldMapStyle.$inferSelect):MapTemplate{return {id:"atlas-style:"+row.id,name:row.name,description:"An existing immutable named appearance preset; its original record is retained.",subtype:"appearance",genre:"custom",attribution:"Original World creator appearance settings",provenance:`Existing named style snapshot v${row.version}; source appearance revision ${row.sourceAppearanceRevision}; ${row.createdAt.toISOString()}`,family:"appearance",revision:1,archived:false,builtIn:false,legacyStyle:true,kind:"preset",artwork:["native:terrain-appearance:v"+row.spec.version],limitations:["This original style is immutable. Apply it through native appearance preview, or intentionally save a personal template copy."],content:{family:"appearance",spec:captureStyleSpec(mapAppearanceSchema.parse(row.spec)),images:[]}};}
export async function getMapTemplates(userId:string,worldId:string,o:{family?:TemplateFamily;review?:boolean;id?:string;revision?:number;offset?:number;search?:string}={}){
 const w=await worldReadAccess(userId,worldId,!!o.review,"assets"),available=await templatesAvailable(),families=Object.keys({geography:1,town:1,interior:1,underground:1,craft:1,appearance:1}).filter(f=>worldScopeAllowed(worldId,templateWorldScope(f))),where=and(sql`((${!o.review} and ${templates.ownerId}=${userId}) or ${templates.worldId}=${worldId})`,!worldProtectedContent(worldId)?sql`(${templates.family}<>'underground' or not exists(select 1 from atlas_template_version v cross join lateral jsonb_each(coalesce(v.snapshot->'content'->'drawing'->'design'->'attributes','{}'::jsonb)) a where v.template_id=${templates.id} and v.revision=${templates.revision} and coalesce(a.value->>'visibility','ordinary')<>'ordinary'))`:undefined,families.length?sql`${templates.family} in (${sql.join(families.map(f=>sql`${f}`),sql`,`)})`:sql`false`);
 if(o.family&&!worldScopeAllowed(worldId,templateWorldScope(o.family)))throw absent();
 if(o.id){
  if(o.id.startsWith("atlas-style:")){if(!worldScopeAllowed(worldId,"atlas"))throw absent();if(o.revision&&o.revision!==1)throw absent();const [style]=await db.select().from(worldMapStyle).where(and(eq(worldMapStyle.id,o.id.slice(12)),eq(worldMapStyle.worldId,worldId)));if(!style)throw absent();return {template:legacyStyle(style),history:[{revision:1}]};}
  const built=builtInTemplate(o.id);if(built){if(!worldScopeAllowed(worldId,templateWorldScope(built.family)))throw absent();if(o.revision&&o.revision!==1)throw absent();return {template:built,history:[{revision:1}]};}
  if(!available)throw absent();const [head]=await db.select().from(templates).where(and(where,eq(templates.id,o.id)));if(!head)throw absent();
  if(!o.review&&head.worldId!==worldId)await checkTemplateSourceRead(worldId,head.worldId,head.id);
  const [version]=await db.select().from(versions).where(and(eq(versions.templateId,head.id),eq(versions.revision,o.revision??head.revision),readableTemplateVersion(worldId)));if(!version)throw absent();
  if(version.snapshot.content.family==="underground"&&version.snapshot.content.drawing&&!worldProtectedContent(worldId)&&JSON.stringify(redactUnderground(version.snapshot.content.drawing.design).features)!==JSON.stringify(version.snapshot.content.drawing.design.features))throw absent();
  return {template:version.snapshot,history:(await db.select({revision:versions.revision,createdAt:versions.createdAt}).from(versions).where(and(eq(versions.templateId,head.id),readableTemplateVersion(worldId))).orderBy(desc(versions.revision)).limit(128)).map(v=>({...v,createdAt:v.createdAt.toISOString()}))};
 }
 const offset=o.offset??0,rows=available?await db.select({metadata:templates.metadata}).from(templates).where(and(where,o.family?eq(templates.family,o.family):undefined,o.search?ilike(templates.name,`%${o.search.slice(0,120)}%`):undefined)).orderBy(asc(templates.name),asc(templates.id)).limit(TEMPLATE_LIMITS.page+1).offset(offset):[];
 const legacy=worldScopeAllowed(worldId,"atlas")&&(!o.family||o.family==="appearance")&&(await db.execute<{ok:boolean}>(sql`select to_regclass('public.world_map_style') is not null ok`)).rows[0].ok?await db.select().from(worldMapStyle).where(and(eq(worldMapStyle.worldId,worldId),o.search?ilike(worldMapStyle.name,`%${o.search.slice(0,120)}%`):undefined)).orderBy(asc(worldMapStyle.name),asc(worldMapStyle.id)).limit(TEMPLATE_LIMITS.page+1).offset(offset):[];
 const built=builtInTemplateMetadata(o.family).filter(t=>worldScopeAllowed(worldId,templateWorldScope(t.family))).filter(t=>!o.search||(t.name+" "+t.description).toLowerCase().includes(o.search.toLowerCase()));
 return {available,canEdit:available&&worldContentEditor(w,userId)&&!o.review,templates:[...offset?[]:built,...rows.slice(0,TEMPLATE_LIMITS.page).map(r=>r.metadata),...legacy.slice(0,TEMPLATE_LIMITS.page).map(r=>{const {content:_,...meta}=legacyStyle(r);void _;return meta;})],next:rows.length>TEMPLATE_LIMITS.page||legacy.length>TEMPLATE_LIMITS.page?offset+TEMPLATE_LIMITS.page:null} satisfies TemplateLibrary;
}
export async function changeMapTemplate(userId:string,worldId:string,input:unknown){
 const c=templateCommandSchema.parse(input),inputHash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
 return worldWriteTransaction(userId,worldId,async tx=>{
  if(!await templatesAvailable(tx))throw new WorldError("Migration 0156 is required to save personal templates. Your source drawing and template draft are retained.",409);
  await tx.select({id:user.id}).from(user).where(eq(user.id,userId)).for("update");
  const [used]=await tx.select().from(operations).where(eq(operations.requestId,c.requestId));if(used){if(used.ownerId!==userId||used.worldId!==worldId||used.inputHash!==inputHash)throw new WorldError("Retry the exact retained template request. This identifier already belongs to different work.",409);return used.result;}
  const [old]=await tx.select().from(templates).where(eq(templates.id,c.templateId));if(old&&old.ownerId!==userId)throw absent();
  await lockWorldForWrite(tx,userId,worldId,templateWorldScope(c.action==="save"?c.content.family:old?.family??"geography"));
  if((old?.revision??0)!==c.revision)throw new WorldError("Another tab saved a newer template revision. Keep or export your draft before loading it.",409);
  if(c.revision>=TEMPLATE_LIMITS.revisions)throw new WorldError("This template has reached 128 retained revisions. Save a deliberately named new template to continue.",413);
  let snapshot:MapTemplate;
  if(c.action==="save"){
   if(old?.archived)throw new WorldError("Restore this template before saving a new revision. Your drawing is retained.",409);
   if(!old&&(await tx.select({n:sql<number>`count(*)::int`}).from(templates).where(eq(templates.ownerId,userId)))[0].n>=TEMPLATE_LIMITS.templates)throw new WorldError("Your library supports 256 retained personal templates. Archiving retains records and capacity.",413);
   let content;try{content=portableTemplate(c.content,randomUUID);validateTemplate(content);}catch(e){throw new WorldError((e as Error).message,400);}
   if(!worldProtectedContent(worldId)){if(content.family==="underground"&&content.drawing&&JSON.stringify(redactUnderground(content.drawing.design).features)!==JSON.stringify(content.drawing.design.features))throw absent();try{preservePrivateCreatorNotes(content,undefined);}catch(error){throw new WorldError((error as Error).message,403);}}
   if(old&&old.family!==content.family)throw new WorldError("Revise within the original map family, or save a new template.",400);
   const previous=old?(await tx.select().from(versions).where(and(eq(versions.templateId,old.id),eq(versions.revision,old.revision))))[0].snapshot:undefined;
   for(const layer of content.images)for(const p of layer.layer.placements){if(artworkAsset(p.assetId))continue;const [a]=await tx.select({owner:atlasAsset.ownerId,archived:atlasAsset.archived}).from(atlasAsset).innerJoin(atlasAssetVersion,and(eq(atlasAssetVersion.assetId,atlasAsset.id),eq(atlasAssetVersion.version,p.version))).where(eq(atlasAsset.id,p.assetId));if(!a||a.owner!==userId)throw absent();if(a.archived&&!previous?.content.images.some(i=>i.layer.placements.some(v=>v.assetId===p.assetId&&v.version===p.version)))throw new WorldError("Restore an archived reference image before adding it to a new template.",400);}
   snapshot={id:c.templateId,name:c.name,description:c.description,subtype:c.subtype,genre:c.genre,attribution:c.attribution,provenance:"Intentional private creator snapshot; permanent links and live destinations removed. Image references pin accepted asset versions.",family:content.family,revision:c.revision+1,archived:old?.archived??false,builtIn:false,kind:content.family==="geography"||content.family==="appearance"?"preset":"layout",artwork:[...new Set(content.images.flatMap(i=>i.layer.placements.map(p=>p.assetId+":"+p.version)))],limitations:["Permanent Place/Shop links and live map destinations are excluded. Connect the new editable copy deliberately."],content};
  }else{
   if(!old)throw absent();const [v]=await tx.select().from(versions).where(and(eq(versions.templateId,old.id),eq(versions.revision,old.revision)));snapshot={...v.snapshot,revision:c.revision+1,archived:c.archived};
  }
  const {content:_,...metadata}=snapshot;void _;const row={id:c.templateId,ownerId:userId,worldId:old?.worldId??worldId,name:snapshot.name,family:snapshot.family,revision:snapshot.revision,archived:snapshot.archived,metadata:metadata as TemplateMetadata};
  if(old)await tx.update(templates).set(row).where(eq(templates.id,old.id));else await tx.insert(templates).values(row);
  await tx.insert(versions).values({templateId:row.id,revision:row.revision,snapshot,requestId:c.requestId});
  const refs=[...new Map(snapshot.content.images.flatMap(i=>i.layer.placements).filter(p=>!artworkAsset(p.assetId)).map(p=>[p.assetId+":"+p.version,p])).values()];if(refs.length)await tx.insert(assetUsage).values(refs.map(p=>({templateId:row.id,templateRevision:row.revision,assetId:p.assetId,assetVersion:p.version})));
  await retainSavedTemplateSources(tx,worldId,row.id,row.revision,refs);
  const result={templateId:row.id,revision:row.revision};await tx.insert(operations).values({requestId:c.requestId,ownerId:userId,worldId,inputHash,result});
  const bytes=(await tx.execute<{bytes:string}>(sql`select (coalesce((select sum(octet_length(metadata::text)) from atlas_template where owner_id=${userId}),0)+coalesce((select sum(octet_length(v.snapshot::text)) from atlas_template_version v join atlas_template t on t.id=v.template_id where t.owner_id=${userId}),0)+coalesce((select sum(octet_length(result::text)+160) from atlas_template_operation where owner_id=${userId}),0)+coalesce((select count(*)*160 from atlas_template_asset_usage u join atlas_template t on t.id=u.template_id where t.owner_id=${userId}),0))::text bytes`)).rows[0];
  if(Number(bytes.bytes)>TEMPLATE_LIMITS.ownerBytes)throw new WorldError("Your retained template history has reached its 128 MiB logical budget. This request was rolled back and your draft remains available.",413);
  return result;
 },"assets");
}
