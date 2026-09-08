import "server-only";
import { and, eq } from "drizzle-orm";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { resolveCharacterSkillLineageSelection, type CharacterWeaponGoverningSelection } from "@/features/items/character-weapon-governance";
import { loadCharacterSkillLineageInputInTransaction } from "@/features/items/character-weapon-governance-service";
import type { OwnedEncounterRuntimeContext, RuntimeIntegrationTransaction } from "./runtime-integration-service";
import type { ResolvedLockedActionSource } from "./action-source-resolver-service";
import type { ActionDeclarationDraft } from "./action-declaration";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { publishTabletopInvalidationInTransaction } from "./tabletop-live-events";

export type CombatSourceResolutionRuling = {
  participantId: number;
  sourceKind: "spell" | "derived-ability" | "creature-ability" | "item";
  sourceRef: string;
  mode: "automatic-no-roll" | "skill-roll" | "attribute-roll" | "opposed-roll" | "manual-god-ruling";
  governing: CharacterWeaponGoverningSelection | { kind: "manual"; label: string; originalTarget: number } | null;
  effectScaling: Record<string, "fixed" | "per-success">;
  reason: string;
  useRequirementsReason?: string;
  initiativeCost?: number;
};
type RecordedRuling = CombatSourceResolutionRuling & { id: string; recordedAt: string; recordedByUserId: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sourceKey = (kind: string, ref: string | null) => kind === "spell" ? (ref ?? "").trim().replace(/^spell:/, "").replace(/^(\d+)$/, "personal:$1") : (ref ?? "").trim();

/** An explicit source-specific G.O.D. ruling fills a missing authored mode. It
 * never invents effects/costs or chooses a Player action. Existing snapshots are
 * immutable; the append-only occurrence record affects only subsequent locks.
 */
export async function recordCombatSourceResolutionInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  actor: { authority: string; userId: string }, input: CombatSourceResolutionRuling,
): Promise<string> {
  if (actor.authority !== "god-owner" || actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may rule on a combat source's missing resolution mode.");
  await assertCombatWritableInTransaction(tx, context.encounterId);
  if (input.useRequirementsReason !== undefined && (!input.useRequirementsReason.trim() || input.useRequirementsReason.length > 2000)) throw new Error("An explicit use-requirements ruling must include its reason.");
  if (input.initiativeCost !== undefined && (!Number.isFinite(input.initiativeCost) || input.initiativeCost <= 0)) throw new Error("The explicit source timing ruling must have a positive Initiative cost.");
  if (!Number.isSafeInteger(input.participantId) || input.participantId === 0 || !["spell", "derived-ability", "creature-ability", "item"].includes(input.sourceKind)
    || !input.sourceRef?.trim() || input.sourceRef.length > 500 || !input.reason?.trim() || input.reason.length > 2000
    || !["automatic-no-roll", "skill-roll", "attribute-roll", "opposed-roll", "manual-god-ruling"].includes(input.mode)) throw new Error("The exact combat source ruling is incomplete.");
  const needsRoll = ["skill-roll", "attribute-roll", "opposed-roll"].includes(input.mode);
  if (needsRoll && !input.governing || !needsRoll && input.governing !== null) throw new Error("The source mode and governing selection do not agree.");
  if (input.mode === "skill-roll" && input.governing?.kind !== "skill" || input.mode === "attribute-roll" && input.governing?.kind !== "attribute") throw new Error("Choose the exact Skill or Attribute required by this mode.");
  if (input.governing?.kind === "manual" && (!input.governing.label.trim() || !Number.isFinite(input.governing.originalTarget))) throw new Error("The explicit manual governing target is invalid.");
  if (input.governing && input.governing.kind !== "manual") {
    if (input.participantId <= 0 || !resolveCharacterSkillLineageSelection(await loadCharacterSkillLineageInputInTransaction(tx, input.participantId), input.governing)) {
      throw new Error("The governing selection is not an exact owned Skill lineage or Attribute for this participant.");
    }
  }
  if (!input.effectScaling || Array.isArray(input.effectScaling) || Object.entries(input.effectScaling).some(([key, scale]) => !key.trim() || key.length > 500 || !["fixed", "per-success"].includes(scale) || scale === "per-success" && !needsRoll)) throw new Error("Effect scaling requires an exact authored effect key and a Roll for per-success scaling.");
  const [participant] = await tx.select().from(campaignSessionEncounterParticipant)
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, input.participantId))).limit(1).for("update");
  if (!participant) throw new Error("The source ruling requires an exact Encounter participant.");
  const state = object(participant.localStateJson);
  const history = Array.isArray(state.combatSourceResolutionHistory) ? state.combatSourceResolutionHistory : [];
  const previous = history.at(-1) as RecordedRuling | undefined;
  const normalized = { ...input, sourceRef: sourceKey(input.sourceKind, input.sourceRef), reason: input.reason.trim() };
  if (previous && Object.keys(normalized).every((key) => JSON.stringify(normalized[key as keyof typeof normalized]) === JSON.stringify(previous[key as keyof typeof normalized]))) return previous.id;
  const row: RecordedRuling = { ...normalized, id: crypto.randomUUID(), recordedAt: new Date().toISOString(), recordedByUserId: actor.userId };
  await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: { ...state, combatSourceResolutionHistory: [...history, row] }, updatedAt: new Date() })
    .where(eq(campaignSessionEncounterParticipant.participantId, participant.participantId));
  await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId, characterIds: [], category: "action" });
  return row.id;
}

export async function applyRecordedSourceResolutionInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext, draft: ActionDeclarationDraft, resolved: ResolvedLockedActionSource,
): Promise<ResolvedLockedActionSource> {
  const [participant] = await tx.select({ state: campaignSessionEncounterParticipant.localStateJson }).from(campaignSessionEncounterParticipant)
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, draft.actorCharacterId))).limit(1);
  const history = object(participant?.state).combatSourceResolutionHistory;
  const actualSourceKey = draft.sourceKind === "spell" ? String(resolved.snapshot.sourceId) : draft.sourceRef;
  const ruling = Array.isArray(history) ? [...history].reverse().find((entry) => entry.sourceKind === draft.sourceKind && sourceKey(entry.sourceKind, entry.sourceRef) === sourceKey(draft.sourceKind, actualSourceKey)) as RecordedRuling | undefined : undefined;
  if (!ruling) return resolved;
  const selected = ruling.governing && ruling.governing.kind !== "manual"
    ? resolveCharacterSkillLineageSelection(await loadCharacterSkillLineageInputInTransaction(tx, draft.actorCharacterId), ruling.governing) : null;
  if (ruling.governing && ruling.governing.kind !== "manual" && !selected) throw new Error("The ruled governing Skill lineage or Attribute is no longer available. Reconcile that exact source ruling.");
  const governingSource = ruling.governing?.kind === "manual" ? ruling.governing : selected?.rollGoverningSource ?? null;
  const governingSnapshot = ruling.governing?.kind === "manual" ? ruling.governing : selected?.rollGoverningSourceSnapshot ?? null;
  if (ruling.initiativeCost !== undefined && resolved.authoritativeInitiativeCost !== null && ruling.initiativeCost !== resolved.authoritativeInitiativeCost) throw new Error("This source already has canonical Initiative timing; the source ruling cannot replace its calculation.");
  return { ...resolved, authoritativeInitiativeCost: resolved.authoritativeInitiativeCost ?? ruling.initiativeCost ?? null,
    governing: ruling.mode === "automatic-no-roll" ? null : ruling.mode === "manual-god-ruling" ? resolved.governing
    : { status: "resolved", source: governingSource, rollOverTarget: selected?.source.originalTarget ?? (ruling.governing?.kind === "manual" ? ruling.governing.originalTarget : null), explanation: ruling.reason },
    snapshot: { ...resolved.snapshot, resolutionMode: ruling.mode, governingSource, governingSnapshot,
      authoredData: { ...resolved.snapshot.authoredData, combatResolutionRuling: ruling },
      effects: resolved.snapshot.effects.map((effect) => ({ ...effect, scaling: ruling.effectScaling[String(effect.instruction.spellEffectId ?? effect.instruction.sortOrder ?? effect.key)] ?? effect.scaling ?? "fixed" })),
      warnings: resolved.snapshot.warnings.filter((warning) => !warning.includes("Roll mode requires") && !warning.includes("Missing canonical Derived Ability")) } };
}
