export type PlayerCharacterDeletionContext = {
  id: number;
  campaignId: number;
  name: string;
  isNpc: boolean;
  campaignOwnerUserId: string;
};

export function authorizePlayerCharacterDeletion(
  context: PlayerCharacterDeletionContext | null,
  actingUserId: string,
): PlayerCharacterDeletionContext {
  if (
    !context ||
    context.isNpc ||
    context.campaignOwnerUserId !== actingUserId
  ) {
    throw new Error(
      "Only a player Character from one of your Campaigns can be deleted.",
    );
  }
  return context;
}
