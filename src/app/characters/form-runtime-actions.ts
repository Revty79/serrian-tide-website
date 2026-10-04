'use server';
import { requireSession } from '@/lib/server-access';
import { revalidatePath } from 'next/cache';
import { readIndividualFormRuntime, previewFormTransition, executeFormTransition, readFormTransitionReceipt, completePendingFormTransition, cancelPendingFormTransition, resetFormUses, type FormUseResetCommand } from '@/features/forms/form-runtime-service';
import type { FormRuntimeCommand, FormRuntimeSelection } from '@/features/forms/form-runtime';
const actor=async()=>({userId:(await requireSession()).user.id});
function refresh(id:number) {
  revalidatePath(`/heavens/characters/${id}`);revalidatePath(`/heavens/npcs/${id}`);revalidatePath('/realms/characters/[characterId]','page');
}
export async function getCurrentForm(characterId:number) {return readIndividualFormRuntime(characterId,await actor());}
export async function reviewFormTransition(selection:FormRuntimeSelection) {return previewFormTransition(selection,await actor());}
export async function commitFormTransition(command:FormRuntimeCommand) {
  const currentActor=await actor();
  try {const result=await executeFormTransition(command,currentActor);refresh(command.characterId);return {ok:true as const,result};}
  catch(error) {
    const receipt=await readFormTransitionReceipt(command.characterId,command.idempotencyKey,currentActor).catch(()=>undefined);
    return {ok:false as const,error:error instanceof Error?error.message:'The Form transition could not be confirmed.',retrySameRequest:receipt!==null};
  }
}
export async function finishFormTransition(characterId:number,requestId:number) {const result=await completePendingFormTransition(characterId,requestId,await actor());refresh(characterId);return result;}
export async function cancelFormTransition(characterId:number,requestId:number) {const result=await cancelPendingFormTransition(characterId,requestId,await actor());refresh(characterId);return result;}
export async function confirmFormUseRefresh(input:FormUseResetCommand) {const result=await resetFormUses(input,await actor());refresh(input.characterId);return result;}
