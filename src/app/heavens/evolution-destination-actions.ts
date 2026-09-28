"use server";
import { revalidatePath } from "next/cache";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { prepareEvolutionDestination, createEvolutionDestination, destinationCreationHasReceipt } from "@/features/evolutions/evolution-destination-service";
import type { CreateEvolutionDestinationInput } from "@/features/evolutions/evolution-destination";
import type { EvolutionOwner } from "@/features/evolutions/evolution-requirements";

export async function prepareDestination(kind: EvolutionOwner, sourceId: number, requestKey: string) {
  const {session} = await requireGodOrAdminAccessContext();
  return prepareEvolutionDestination(kind,sourceId,requestKey,session.user.id);
}
export async function createDestination(input: CreateEvolutionDestinationInput) {
  try {
    const {session} = await requireGodOrAdminAccessContext();
    const result = await createEvolutionDestination(input,session.user.id);
    revalidatePath(`/heavens/${input.kind}s`);
    return {ok:true as const,result};
  } catch(error) {
    // Keep the exact request if a receipt exists or its outcome cannot be read.
    const retrySameRequest=await destinationCreationHasReceipt(input.requestKey).catch(()=>true);
    return {ok:false as const,error:error instanceof Error ? error.message : "Destination creation failed.",retrySameRequest};
  }
}
