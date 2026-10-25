import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,asc,eq,ilike,isNull,or,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldGeography} from "@/db/world-atlas-schema";
import {worldSettlementProfile} from "@/db/world-town-schema";
import {worldTownPlace,worldShop,worldShopLocation,worldShopOffering,worldTownResident,worldPlacePerson,worldCreationOperation} from "@/db/world-town-commerce-schema";
import {item,weaponProfile,armorProfile} from "@/db/item-schema";
import {alias} from "drizzle-orm/pg-core";
const shopAmmunitionItem=alias(item,"world_shop_ammunition_item"),shopAmmunitionWeaponProfile=alias(weaponProfile,"world_shop_ammunition_weapon_profile");
import {itemDiscoveryWhere} from "@/features/catalog-visibility/catalog-query";
import {worldReadAccess,worldWriteTransaction,WorldError} from "./world-service";
import {selectedTimeline} from "./history-version-service";
import {peoplesReferencesInTransaction} from "./peoples-service";
import {businessCommandSchema,type BusinessBundle,type BusinessResult} from "./world-business";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const unavailable=()=>new WorldError("This World creation is unavailable.",404);
const conflict=()=>new WorldError("Live values changed while you were editing. Your draft is retained. Choose Keep My Draft or Use Live Values before saving again.",409);
async function geography(tx:Tx,worldId:string,id:string,active=true){const [row]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,id),eq(worldGeography.worldId,worldId)));if(!row)throw unavailable();if(active&&row.archivedAt)throw new WorldError("Restore this creation before editing its contents.",400);return row;}
async function town(tx:Tx,worldId:string,id:string){const [row]=await tx.select().from(worldSettlementProfile).where(and(eq(worldSettlementProfile.geographyId,id),eq(worldSettlementProfile.worldId,worldId)));if(!row)throw unavailable();await geography(tx,worldId,id);return row;}
async function shop(tx:Tx,worldId:string,id:string){const [row]=await tx.select().from(worldShop).where(and(eq(worldShop.geographyId,id),eq(worldShop.worldId,worldId)));if(!row)throw unavailable();await geography(tx,worldId,id);return row;}
function checkRevision(current:{revision:number}|undefined,expected:number|null){if(current?current.revision!==expected:expected!==null)throw conflict();}
async function saveGeography(tx:Tx,worldId:string,id:string,name:string,description:string,current:boolean){if(current){const g=await geography(tx,worldId,id);await tx.update(worldGeography).set({name,description,revision:g.revision+1,updatedAt:new Date()}).where(eq(worldGeography.id,id));}else await tx.insert(worldGeography).values({id,worldId,name,description,kind:"location",context:"place"});}
async function individuals(tx:Tx,worldId:string){const timeline=await selectedTimeline(tx,worldId);const refs=await peoplesReferencesInTransaction(tx,worldId,timeline.id);return refs.entities.filter(e=>e.family==="individual");}

async function saveLocation(tx:Tx,worldId:string,c:{id:string|null;revision:number|null;newId:string;shopId:string;townId:string;placeId:string|null;note:string;sortOrder:number}){
 await shop(tx,worldId,c.shopId);await town(tx,worldId,c.townId);
 if(c.placeId){const [place]=await tx.select().from(worldTownPlace).where(and(eq(worldTownPlace.geographyId,c.placeId),eq(worldTownPlace.worldId,worldId),eq(worldTownPlace.townId,c.townId)));if(!place)throw new WorldError("Choose a place in this Town.",400);await geography(tx,worldId,c.placeId);}
 const [current]=c.id?await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.id,c.id),eq(worldShopLocation.worldId,worldId))):await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.worldId,worldId),eq(worldShopLocation.shopId,c.shopId),eq(worldShopLocation.townId,c.townId)));
 if(c.id&&!current)throw unavailable();checkRevision(!c.id&&current?.removedAt?undefined:current,c.revision);if(current&&(current.shopId!==c.shopId||current.townId!==c.townId))throw new WorldError("Remove this location link and add the new Town separately.",400);
 const id=current?.id??c.newId,values={worldId,shopId:c.shopId,townId:c.townId,placeId:c.placeId,note:c.note,sortOrder:c.sortOrder,removedAt:null,revision:(current?.revision??0)+1};if(current)await tx.update(worldShopLocation).set(values).where(eq(worldShopLocation.id,id));else await tx.insert(worldShopLocation).values({id,...values});return id;
}

export async function readWorldBusiness(userId:string,worldId:string,options:{review?:boolean;ordinary?:boolean}={}):Promise<BusinessBundle>{
 const parent=await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw unavailable();
 return db.transaction(async tx=>{
  const shops=await tx.select({id:worldShop.geographyId,revision:worldShop.revision,archived:sql<boolean>`${worldGeography.archivedAt} IS NOT NULL`,definition:worldShop.definition,godNotes:worldShop.godNotes,sortOrder:worldShop.sortOrder,archiveReason:worldShop.archiveReason}).from(worldShop).innerJoin(worldGeography,eq(worldGeography.id,worldShop.geographyId)).where(eq(worldShop.worldId,worldId)).orderBy(asc(worldShop.sortOrder),asc(worldGeography.name)).limit(2001);
  const shopLocations=await tx.select({id:worldShopLocation.id,shopId:worldShopLocation.shopId,townId:worldShopLocation.townId,placeId:worldShopLocation.placeId,note:worldShopLocation.note,sortOrder:worldShopLocation.sortOrder,revision:worldShopLocation.revision}).from(worldShopLocation).where(and(eq(worldShopLocation.worldId,worldId),isNull(worldShopLocation.removedAt))).orderBy(asc(worldShopLocation.sortOrder),asc(worldShopLocation.id)).limit(10001);
  const places=await tx.select({id:worldTownPlace.geographyId,revision:worldTownPlace.revision,archived:sql<boolean>`${worldGeography.archivedAt} IS NOT NULL`,townId:worldTownPlace.townId,placeKind:sql<"place-of-interest"|"building">`${worldTownPlace.placeKind}`,name:worldGeography.name,description:worldGeography.description,category:worldTownPlace.category,locationNotes:worldTownPlace.locationNotes,godNotes:worldTownPlace.godNotes,sortOrder:worldTownPlace.sortOrder,archiveReason:worldTownPlace.archiveReason}).from(worldTownPlace).innerJoin(worldGeography,eq(worldGeography.id,worldTownPlace.geographyId)).where(eq(worldTownPlace.worldId,worldId)).orderBy(asc(worldTownPlace.sortOrder),asc(worldGeography.name)).limit(2001);
  const residents=(await tx.select().from(worldTownResident).where(eq(worldTownResident.worldId,worldId)).orderBy(asc(worldTownResident.name)).limit(2001)).map(({archivedAt,worldId:_,loreFamily:__,...r})=>{void _;void __;return {...r,archived:!!archivedAt};});
  const people=await tx.select({id:worldPlacePerson.id,geographyId:worldPlacePerson.geographyId,residentId:sql<string>`coalesce(${worldPlacePerson.individualId},${worldPlacePerson.residentId})`,role:worldPlacePerson.role,note:worldPlacePerson.note,primaryContact:worldPlacePerson.primaryContact,sortOrder:worldPlacePerson.sortOrder,revision:worldPlacePerson.revision}).from(worldPlacePerson).where(eq(worldPlacePerson.worldId,worldId)).orderBy(asc(worldPlacePerson.sortOrder),asc(worldPlacePerson.id)).limit(10001);
  const offerings=await tx.select({id:worldShopOffering.id,shopId:worldShopOffering.shopId,revision:worldShopOffering.revision,definition:worldShopOffering.definition,sortOrder:worldShopOffering.sortOrder,itemName:item.name,canonicalPrice:item.credits}).from(worldShopOffering).innerJoin(item,eq(item.id,worldShopOffering.itemId)).where(and(eq(worldShopOffering.worldId,worldId),isNull(worldShopOffering.removedAt))).orderBy(asc(worldShopOffering.sortOrder),asc(item.name)).limit(10001);
  if(shops.length>2000||places.length>2000||residents.length>2000||people.length>10000||offerings.length>10000||shopLocations.length>10000)throw new WorldError("This World exceeds the supported creation workspace size. All saved records are retained.",400);
  return {shops,shopLocations,places,residents,people,offerings,individuals:await individuals(tx,worldId),canEdit:!options.review&&parent.ownerId===userId&&!parent.archivedAt};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function worldShopCatalog(userId:string,worldId:string,search:string,group:string,review=false){const parent=await worldReadAccess(userId,worldId,review);return db.select({
      id: item.id,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      family: item.family,
      category: item.category,
      description: item.description,
      credits: item.credits,
      priceBasis: item.priceBasis,
      weight: item.weight,
      weightUnit: item.weightUnit,
      durability: item.durability,
      isMagical: item.isMagical,
      weaponType: weaponProfile.weaponType,
      handedness: weaponProfile.handedness,
      damageSource: weaponProfile.damageSource,
      damage: weaponProfile.damage,
      damageType: weaponProfile.damageType,
      ammunitionItemId: weaponProfile.ammunitionItemId,
      ammunitionItemName: shopAmmunitionItem.name,
      ammunitionDamage: shopAmmunitionWeaponProfile.damage,
      ammunitionDamageType: shopAmmunitionWeaponProfile.damageType,
      rangeText: weaponProfile.rangeText,
      reachText: weaponProfile.reachText,
      weaponRulesText: weaponProfile.rulesText,
      armorType: armorProfile.armorType,
      coverage: armorProfile.coverage,
      baseSoak: armorProfile.baseSoak,
      armorDamageModifiers: armorProfile.damageModifiersSourceText,
      armorRulesText: armorProfile.rulesText,
      archivedAt: item.archivedAt,
}).from(item).leftJoin(weaponProfile,eq(weaponProfile.itemId,item.id)).leftJoin(shopAmmunitionItem,eq(shopAmmunitionItem.id,weaponProfile.ammunitionItemId)).leftJoin(shopAmmunitionWeaponProfile,eq(shopAmmunitionWeaponProfile.itemId,shopAmmunitionItem.id)).leftJoin(armorProfile,eq(armorProfile.itemId,item.id)).where(await itemDiscoveryWhere(parent.ownerId,isNull(item.archivedAt),search?or(ilike(item.name,`%${search.slice(0,120)}%`),ilike(item.canonicalId,`%${search.slice(0,120)}%`)):undefined,group==="inventory"?eq(item.catalogScope,"inventory"):["weapon","armor","general"].includes(group)?eq(item.equipmentGroup,group):undefined)).orderBy(asc(item.name),asc(item.id)).limit(100);}

export async function changeWorldBusiness(userId:string,worldId:string,input:unknown):Promise<BusinessResult>{
 const c=businessCommandSchema.parse(input),inputHash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
 return worldWriteTransaction(userId,worldId,async tx=>{
  const [retry]=await tx.select().from(worldCreationOperation).where(eq(worldCreationOperation.requestId,c.requestId));if(retry){if(retry.authorId!==userId||retry.worldId!==worldId||retry.inputHash!==inputHash)throw conflict();return retry.result;}
  let result:BusinessResult;
  if(c.action==="save-shop"){
   const current=c.id?await shop(tx,worldId,c.id):undefined;checkRevision(current,c.revision);if(current&&(c.townId||c.placeId))throw new WorldError("Edit the Shop location links separately from its shared business settings.",400);
   const id=c.id??c.requestId;await saveGeography(tx,worldId,id,c.definition.name,c.definition.description,!!current);const values={worldId,definition:c.definition,godNotes:c.godNotes,sortOrder:c.sortOrder,revision:(current?.revision??0)+1};if(current)await tx.update(worldShop).set(values).where(eq(worldShop.geographyId,id));else await tx.insert(worldShop).values({geographyId:id,...values});if(!current&&c.townId)await saveLocation(tx,worldId,{id:null,revision:null,newId:randomUUID(),shopId:id,townId:c.townId,placeId:c.placeId,note:"",sortOrder:0});else if(!current&&c.placeId)throw new WorldError("Choose the Town for this building.",400);result={id,kind:"shop"};
  }else if(c.action==="save-location"){
   const id=await saveLocation(tx,worldId,{...c,newId:c.requestId});result={id,kind:"location"};
  }else if(c.action==="remove-location"){
   const [current]=await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.id,c.id),eq(worldShopLocation.worldId,worldId)));if(!current||current.removedAt)throw unavailable();checkRevision(current,c.revision);await shop(tx,worldId,current.shopId);await tx.update(worldShopLocation).set({removedAt:new Date(),revision:current.revision+1}).where(eq(worldShopLocation.id,c.id));result={id:c.id,kind:"location"};
  }else if(c.action==="save-place"){
   await town(tx,worldId,c.draft.townId);const [current]=c.id?await tx.select().from(worldTownPlace).where(and(eq(worldTownPlace.geographyId,c.id),eq(worldTownPlace.worldId,worldId))):[];if(c.id&&!current)throw unavailable();checkRevision(current,c.revision);if(current&&current.townId!==c.draft.townId)throw new WorldError("A saved place retains its Town identity.",400);const id=c.id??c.requestId;await saveGeography(tx,worldId,id,c.draft.name,c.draft.description,!!current);const {name:_,description:__,...fields}=c.draft;void _;void __;const values={worldId,...fields,revision:(current?.revision??0)+1};if(current)await tx.update(worldTownPlace).set(values).where(eq(worldTownPlace.geographyId,id));else await tx.insert(worldTownPlace).values({geographyId:id,...values});result={id,kind:"place"};
  }else if(c.action==="save-resident"){
   throw new WorldError("Use the full World Individual creator, then associate that saved inhabitant with this Town, Shop or place.",400);
  }else if(c.action==="save-offering"){
   await shop(tx,worldId,c.shopId);const [current]=c.id?await tx.select().from(worldShopOffering).where(and(eq(worldShopOffering.id,c.id),eq(worldShopOffering.worldId,worldId),eq(worldShopOffering.shopId,c.shopId))):await tx.select().from(worldShopOffering).where(and(eq(worldShopOffering.worldId,worldId),eq(worldShopOffering.shopId,c.shopId),eq(worldShopOffering.itemId,c.definition.itemId)));
   if(c.id&&!current)throw unavailable();checkRevision(!c.id&&current?.removedAt?undefined:current,c.revision);if(current&&current.itemId!==c.definition.itemId)throw new WorldError("Remove this offering and add a different Item rather than changing its identity.",400);
   if(!current){const [allowed]=await tx.select({id:item.id}).from(item).where(and(eq(item.id,c.definition.itemId),await itemDiscoveryWhere(userId,isNull(item.archivedAt))));if(!allowed)throw new WorldError("Choose an available Item from the catalog.",400);}
   const id=current?.id??c.requestId,values={worldId,shopId:c.shopId,itemId:c.definition.itemId,definition:c.definition,sortOrder:c.sortOrder,revision:(current?.revision??0)+1,removedAt:null};if(current)await tx.update(worldShopOffering).set(values).where(eq(worldShopOffering.id,id));else await tx.insert(worldShopOffering).values({id,...values});result={id,kind:"offering"};
  }else if(c.action==="remove-offering"){
   const [current]=await tx.select().from(worldShopOffering).where(and(eq(worldShopOffering.id,c.id),eq(worldShopOffering.worldId,worldId)));if(!current||current.removedAt)throw unavailable();checkRevision(current,c.revision);await shop(tx,worldId,current.shopId);await tx.update(worldShopOffering).set({removedAt:new Date(),revision:current.revision+1}).where(eq(worldShopOffering.id,c.id));result={id:c.id,kind:"offering"};
  }else if(c.action==="save-person"){
   await geography(tx,worldId,c.geographyId);const [subject]=(await tx.execute<{ok:boolean}>(sql`select exists(select 1 from world_settlement_profile where geography_id=${c.geographyId} and world_id=${worldId} union all select 1 from world_shop where geography_id=${c.geographyId} and world_id=${worldId} union all select 1 from world_town_place where geography_id=${c.geographyId} and world_id=${worldId}) ok`)).rows;if(!subject.ok)throw unavailable();
   const worldIndividuals=await individuals(tx,worldId),individual=worldIndividuals.find(i=>i.id===c.residentId&&!i.archived);
   const [current]=c.id?await tx.select().from(worldPlacePerson).where(and(eq(worldPlacePerson.id,c.id),eq(worldPlacePerson.worldId,worldId))):await tx.select().from(worldPlacePerson).where(and(eq(worldPlacePerson.geographyId,c.geographyId),eq(worldPlacePerson.individualId,c.residentId)));
   if(c.id&&!current)throw unavailable();checkRevision(current,c.revision);
   if(current&&(current.geographyId!==c.geographyId||(current.individualId??current.residentId)!==c.residentId))throw conflict();
   // Earlier 0134 profiles remain readable; new relationships use the full existing Individual identity directly.
   if(!individual&&(!current?.residentId||current.residentId!==c.residentId))throw new WorldError("Choose an active saved World Individual.",400);
   if(current?.residentId){const [retained]=await tx.select().from(worldTownResident).where(and(eq(worldTownResident.id,current.residentId),eq(worldTownResident.worldId,worldId)));if(!retained||retained.archivedAt)throw new WorldError("Restore the retained inhabitant before changing its association.",400);}
   if(c.primaryContact)await tx.update(worldPlacePerson).set({primaryContact:false,revision:sql`${worldPlacePerson.revision}+1`}).where(and(eq(worldPlacePerson.worldId,worldId),eq(worldPlacePerson.geographyId,c.geographyId),eq(worldPlacePerson.primaryContact,true)));
   const id=current?.id??c.requestId,values={worldId,geographyId:c.geographyId,residentId:current?.residentId??null,individualId:current?.residentId?null:c.residentId,role:c.role,note:c.note,primaryContact:c.primaryContact,sortOrder:c.sortOrder,revision:(current?.revision??0)+1};if(current)await tx.update(worldPlacePerson).set(values).where(eq(worldPlacePerson.id,id));else await tx.insert(worldPlacePerson).values({id,...values});result={id,kind:"association"};
  }else if(c.action==="remove-person"){
   const [current]=await tx.select().from(worldPlacePerson).where(and(eq(worldPlacePerson.id,c.id),eq(worldPlacePerson.worldId,worldId)));if(!current)throw unavailable();checkRevision(current,c.revision);await geography(tx,worldId,current.geographyId);await tx.delete(worldPlacePerson).where(eq(worldPlacePerson.id,c.id));result={id:c.id,kind:"association"};
  }else{
   if(c.kind==="resident"){const [current]=await tx.select().from(worldTownResident).where(and(eq(worldTownResident.id,c.id),eq(worldTownResident.worldId,worldId)));if(!current)throw unavailable();checkRevision(current,c.revision);await tx.update(worldTownResident).set({archivedAt:c.archived?new Date():null,revision:current.revision+1}).where(eq(worldTownResident.id,c.id));}
   else{const table=c.kind==="shop"?worldShop:worldTownPlace;const [current]=await tx.select({revision:table.revision}).from(table).where(and(eq(table.geographyId,c.id),eq(table.worldId,worldId)));if(!current)throw unavailable();checkRevision(current,c.revision);const g=await geography(tx,worldId,c.id,false);await tx.update(worldGeography).set({archivedAt:c.archived?new Date():null,revision:g.revision+1,updatedAt:new Date()}).where(eq(worldGeography.id,c.id));await tx.update(table).set({archiveReason:c.archived?c.reason:"",revision:current.revision+1}).where(eq(table.geographyId,c.id));}
   result={id:c.id,kind:c.kind};
  }
  await tx.insert(worldCreationOperation).values({requestId:c.requestId,worldId,authorId:userId,inputHash,result,snapshot:{version:1,acceptedCommand:c}});return result;
 });
}
