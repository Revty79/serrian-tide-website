import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import type { DeclarationRollInput } from "@/features/tabletop-operations/action-declaration-service";
import type { SpellCastRuntimeSelections } from "@/features/characters/character-spell-runtime";
import type { FirearmAttackCommand } from "@/features/tabletop-operations/firearm-attack-service";

export type CombatSourceChoice = { kind: "weapon" | "spell" | "item" | "derived-ability" | "creature-attack" | "creature-ability";
  ref: string; name: string; instanceId: number | null; itemId: number | null; description: string; unavailable?: string; handedness?: string };
export type CombatChoice = { participantId: number; source: CombatSourceChoice; targetIds: number[];
  spellSelections?: SpellCastRuntimeSelections; effectSelections?: Record<string, Record<string, unknown>>;
  heldIntervention?: boolean; eventKey?: string;
  weaponHands?: 1 | 2;
  calledShot?: { locationNumber: number; label: string; objective: string; penalty?: number; reason?: string; requestId?: number };
  firearm?: { firingModeId: number; aimInitiative: number; firingDurationInitiative: number };
  godTiming?: { cost: number; reason: string };
};
export type CombatSubmission = { choice: CombatChoice; requestKey: string; roll?: DeclarationRollInput };
export function choiceDraft(choice: CombatChoice): ActionDeclarationDraft {
  const source = choice.source;
  return { actorCharacterId: choice.participantId, targetCharacterIds: choice.targetIds,
    label: source.name, actionKind: source.kind === "weapon" || source.kind === "creature-attack" ? "weapon-attack" : source.kind === "spell" ? "spell-cast" : source.kind === "item" ? "item-use" : "ability-use",
    sourceKind: source.kind, sourceRef: source.ref, sourceInstanceId: source.instanceId, weaponItemId: source.itemId,
    firingModeId: null, sourcePayload: { combatScreen: true, selections: choice.spellSelections ?? { targetGroups: {}, applications: {} }, effectSelections: choice.effectSelections ?? {}, eventKey: choice.eventKey ?? null, weaponHands: choice.weaponHands ?? null },
    attackMode: "Authored attack", initiativeCost: choice.godTiming?.cost ?? 1, allowsMultiRound: true,
    heldIntervention: choice.heldIntervention === true, windowKind: source.kind === "weapon" || source.kind === "creature-attack" ? "melee-overlap" : "ordinary",
    aimDeclared: false, calledShot: { declared: !!choice.calledShot, label: choice.calledShot?.label ?? "", assignedPenalty: choice.calledShot?.penalty ?? null },
    explicitModifiers: [], preparesForDeclarationId: null, godNotes: choice.godTiming?.reason ?? "" };
}
export function firearmCommand(choice: CombatChoice): FirearmAttackCommand {
  if (!choice.firearm || !choice.source.instanceId || choice.targetIds.length !== 1) throw new Error("Choose one exact firearm and target.");
  return { actorParticipantId: choice.participantId, targetParticipantId: choice.targetIds[0], itemInstanceId: choice.source.instanceId,
    ...choice.firearm, weaponHands: choice.weaponHands, calledShot: { declared: !!choice.calledShot, objective: choice.calledShot?.objective ?? "",
      locationNumber: choice.calledShot?.locationNumber ?? null, penalty: choice.calledShot?.penalty ?? null, reason: choice.calledShot?.reason ?? "" }, playerRulingRequestId: choice.calledShot?.requestId ?? null };
}
export function physicalPercentile(value: string) {
  if (!/^(?:\d{1,2}|100)$/.test(value.trim())) throw new Error("Enter a physical percentile result from 01 to 100; 00 means 100.");
  return Number(value) === 0 ? 100 : Number(value);
}
