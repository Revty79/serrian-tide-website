export type PlayerPendingActionSummary = null | {
  id: number;
  label: string;
  status: string;
  remainingInitiativeCost: number;
  expectedCompletionInitiative: number;
};

export const PLAYER_ENCOUNTER_CAPABILITIES = [
  "initiative.hold",
  "initiative.pass",
  "action.weapon",
  "action.spell",
  "reaction.declare",
  "roll.record",
] as const;

export type PlayerEncounterCapability = (typeof PLAYER_ENCOUNTER_CAPABILITIES)[number];

export type AuthorizedEncounterActor =
  | {
      kind: "god-owner";
      userId: string;
      campaignId: number;
    }
  | {
      kind: "player-character";
      userId: string;
      campaignId: number;
      characterId: number;
      capabilities: readonly PlayerEncounterCapability[];
    };

export function authorizePlayerEncounterActor(input: {
  playerUserId: string;
  campaignId: number;
  characterId: number;
  ownedCharacterId: number;
}): Extract<AuthorizedEncounterActor, { kind: "player-character" }> {
  if (!input.playerUserId.trim()) throw new Error("Player authorization requires a signed-in user.");
  if (input.characterId !== input.ownedCharacterId) {
    throw new Error("A Player may operate only their own Encounter Character.");
  }
  return {
    kind: "player-character",
    userId: input.playerUserId,
    campaignId: input.campaignId,
    characterId: input.characterId,
    capabilities: PLAYER_ENCOUNTER_CAPABILITIES,
  };
}

export function assertPlayerEncounterCapability(
  actor: AuthorizedEncounterActor,
  capability: PlayerEncounterCapability,
): asserts actor is Extract<AuthorizedEncounterActor, { kind: "player-character" }> {
  if (actor.kind !== "player-character" || !actor.capabilities.includes(capability)) {
    throw new Error(`This actor is not authorized for ${capability}.`);
  }
}

export type PlayerParticipantProjectionInput = {
  identity: { characterId: number; name: string; kindLabel: string };
  initiative:
    | { enrolled: false }
    | {
        enrolled: true;
        currentInitiative: number;
        participationStatus: string;
        pendingAction: PlayerPendingActionSummary;
      };
};

export type PlayerParticipantProjection = {
  characterId: number;
  name: string;
  kindLabel: string;
  currentInitiative: number | null;
  participationStatus: string;
  pendingAction: PlayerPendingActionSummary;
};

export function projectPlayerParticipantSummaries(
  participants: readonly PlayerParticipantProjectionInput[],
): PlayerParticipantProjection[] {
  return participants.map((participant) => ({
    characterId: participant.identity.characterId,
    name: participant.identity.name,
    kindLabel: participant.identity.kindLabel,
    currentInitiative: participant.initiative.enrolled
      ? participant.initiative.currentInitiative
      : null,
    participationStatus: participant.initiative.enrolled
      ? participant.initiative.participationStatus
      : "not-enrolled",
    pendingAction: participant.initiative.enrolled ? participant.initiative.pendingAction : null,
  }));
}

export function assertPlayerRollVisibility(rolls: readonly { visibility: string }[]): void {
  if (rolls.some(({ visibility }) => visibility !== "table")) {
    throw new Error("Player encounter projection cannot contain private Roll history.");
  }
}
