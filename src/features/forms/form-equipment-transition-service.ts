import 'server-only';
import { eq } from 'drizzle-orm';
import type { db } from '@/db';
import { campaignCharacterProfile } from '@/db/realm-schema';
import { readCharacterEquipmentStateInTransaction, setInstanceEquipmentStateInTransaction, setStackEquipmentStateInTransaction } from '@/features/items/equipment-state-service';
import { handleInventoryInTransaction, inventoryScenes } from '@/features/items/inventory-custody-service';
import { readInventoryAccessInTransaction } from '@/features/items/inventory-access-service';
import { availableLooseQuantity, resolveInventoryAvailability } from '@/features/items/inventory-access';
import type { FormTransitionEvidence } from './form-runtime';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type FormEquipmentDropPlan = {
  sceneId: number | null; location: string | null; blockers: string[];
  items: Array<{itemId:number;instanceId:number|null;name:string;quantity:number;previousStates:Array<'equipped'|'worn'|'wielded'>}>;
};
export async function previewFormEquipmentDrops(tx:Tx,characterId:number,sceneId:number|null):Promise<FormEquipmentDropPlan> {
  const equipment=await readCharacterEquipmentStateInTransaction(tx,characterId);
  const items:FormEquipmentDropPlan['items']=[
    ...equipment.instances.filter(i=>i.state!=='inactive').map(i=>({itemId:i.itemId,instanceId:i.instanceId,name:i.itemName,quantity:1,previousStates:[i.state as 'equipped'|'worn'|'wielded']})),
    ...equipment.stacks.flatMap(i=>{
      const quantity=i.equippedQuantity+i.wornQuantity+i.wieldedQuantity;
      const previousStates=(['equipped','worn','wielded'] as const).filter(state=>i[`${state}Quantity`]>0);
      return quantity?[{itemId:i.itemId,instanceId:null,name:i.itemName,quantity,previousStates}]:[];
    }),
  ];
  if(!items.length)return {items,sceneId:null,location:null,blockers:[]};
  const scenes=await inventoryScenes(tx,characterId),scene=sceneId?scenes.find(s=>s.sceneId===sceneId):scenes.length===1?scenes[0]:null;
  const blockers:string[]=[];
  if(!scene)blockers.push('Dropping active equipment needs an exact active Scene location. The G.O.D. must resolve custody with the existing inventory controls, or place the individual in a Scene, then review the Form again. No location will be invented.');
  const graph=await readInventoryAccessInTransaction(tx,characterId);
  for(const item of items){
    if(item.instanceId!==null){
      const availability=resolveInventoryAvailability(graph,{instanceId:item.instanceId});
      if(!availability.usable)blockers.push(`${item.name} #${item.instanceId} cannot be dropped independently: ${availability.blocker??'resolve its container or attachment first'}.`);
    }else if(availableLooseQuantity(graph,item.itemId)<item.quantity)blockers.push(`${item.name}: active quantities are not all Loose. The G.O.D. must resolve exact equipment allocations before entry.`);
  }
  return {items,sceneId:scene?.sceneId??null,location:scene?.contextLabel??null,blockers};
}
/** Called only inside the fenced Enter transaction, before the body changes. */
export async function applyFormEquipmentDrops(tx:Tx,characterId:number,userId:string,requestId:number,plan:FormEquipmentDropPlan):Promise<NonNullable<FormTransitionEvidence['equipmentDrops']>> {
  if(plan.blockers.length)throw new Error(plan.blockers.join(' '));
  const drops:NonNullable<FormTransitionEvidence['equipmentDrops']>=[];
  for(const item of plan.items){
    if(!plan.sceneId)throw new Error('The equipment drop location is missing. Review the Form again.');
    if(item.instanceId!==null)await setInstanceEquipmentStateInTransaction(tx,{characterId,instanceId:item.instanceId,state:'inactive'});
    else for(const state of item.previousStates)await setStackEquipmentStateInTransaction(tx,{characterId,itemId:item.itemId,state,quantity:0});
    const [profile]=await tx.select({version:campaignCharacterProfile.commerceVersion}).from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId,characterId));
    const result=await handleInventoryInTransaction(tx,userId,{characterId,expectedCommerceVersion:profile?.version??0,requestKey:`form-drop-${requestId}-${item.instanceId===null?'stack':'copy'}-${item.instanceId??item.itemId}`,
      operation:'drop',instanceId:item.instanceId,itemId:item.itemId,quantity:item.quantity,sceneId:plan.sceneId,note:'Dropped by the authored Form entry equipment policy.'},true);
    drops.push({itemId:item.itemId,instanceId:item.instanceId,quantity:item.quantity,previousStates:item.previousStates,custodyEventId:result.eventId,sceneId:plan.sceneId});
  }
  return drops;
}
