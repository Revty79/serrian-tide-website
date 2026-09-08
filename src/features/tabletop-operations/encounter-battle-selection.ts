export type BattleSelectableParticipant = Readonly<{
  characterId: number;
  choiceOwner: "god" | "player";
  participationStatus: string;
}>;

export function resolveEncounterBattleParticipantId(input: Readonly<{
  requestedParticipantId: number | null;
  participants: readonly BattleSelectableParticipant[];
  nextEventParticipantIds: readonly number[];
}>): number | null {
  if (input.participants.some(({ characterId }) => characterId === input.requestedParticipantId)) {
    return input.requestedParticipantId;
  }
  return input.participants.find(({ characterId, choiceOwner }) => (
    choiceOwner === "god" && input.nextEventParticipantIds.includes(characterId)
  ))?.characterId
    ?? input.participants.find(({ choiceOwner, participationStatus }) => (
      choiceOwner === "god" && participationStatus === "active"
    ))?.characterId
    ?? input.participants[0]?.characterId
    ?? null;
}
