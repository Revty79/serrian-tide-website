import type {
  ActionDeclarationView,
  ActionDeclarationWorkspaceView,
} from "./action-declaration-service";

function projectOpponentDeclaration(declaration: ActionDeclarationView): ActionDeclarationView {
  return {
    ...declaration,
    draft: {
      ...declaration.draft,
      sourceRef: null,
      sourceInstanceId: null,
      sourcePayload: null,
      weaponItemId: null,
      firingModeId: null,
      explicitModifiers: [],
      godNotes: "",
    },
    lockedSnapshot: declaration.lockedSnapshot === null ? null : {
      ...declaration.lockedSnapshot,
      source: {
        kind: declaration.lockedSnapshot.source.kind,
        ref: null,
        instanceId: null,
      },
      weapon: null,
      governing: null,
      authoredSource: null,
      explicitModifiers: [],
      godNotes: "",
      authorUserId: "",
      lockedByUserId: "",
    },
    events: [],
    rulingReason: "",
    rulingNotes: "",
  };
}

export function projectActionDeclarationWorkspaceForPlayer(
  workspace: ActionDeclarationWorkspaceView,
  playerCharacterId: number,
): ActionDeclarationWorkspaceView {
  if (!Number.isSafeInteger(playerCharacterId) || playerCharacterId <= 0) {
    throw new Error("Player Character identity is invalid.");
  }
  return {
    ...workspace,
    participants: workspace.participants.map((participant) => participant.characterId === playerCharacterId
      ? participant
      : {
          ...participant,
          weapons: [],
          movementModes: [],
          creatureAttacks: [],
        }),
    declarations: workspace.declarations.map((declaration) => declaration.actorCharacterId === playerCharacterId
      ? declaration
      : projectOpponentDeclaration(declaration)),
  };
}
