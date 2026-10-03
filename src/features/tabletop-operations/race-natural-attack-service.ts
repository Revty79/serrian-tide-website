import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { race, raceNaturalAttack } from "@/db/race-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterActiveHealthPool, campaignCharacterInjury } from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { loadCharacterSkillLineageInputInTransaction } from "@/features/items/character-weapon-governance-service";
import { resolveWeaponRange } from "@/features/items/weapon-range";
import { createHumanoidRaceAnatomy } from "@/features/races/race-anatomy";
import { combatLimbConditions } from "./combat-limb-state";
import { raceAttackAnatomyIssue, raceNaturalAttackRef, resolveRaceAttackGovernance } from "./race-natural-attack-runtime";
import type { RaceNaturalAttack } from "@/features/races/race-natural-attacks";
import type { RuntimeIntegrationTransaction as Tx, OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import type { ActionDeclarationDraft } from "./action-declaration";
import type { ResolvedLockedActionSource } from "./action-source-resolver-service";
import { applyRecordedSourceResolutionInTransaction } from "./combat-source-resolution-service";
import { attachedMagicEffects } from './attached-magic-effects';

/** Caller authorizes the encounter/actor. This reader never consults Form previews. */
export async function readRaceAttackSourcesInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, participantId: number) {
  if (participantId <= 0) return [];
  const [owner] = await tx.select({ raceId: race.id, raceName: race.name, anatomy: race.anatomy, revision: race.updatedAt, local: campaignSessionEncounterParticipant.localStateJson })
    .from(campaignSessionEncounterParticipant).innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .innerJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .innerJoin(race, eq(race.id, campaignCharacterProfile.raceId))
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, participantId), eq(campaignCharacter.campaignId, context.campaignId), eq(campaignCharacter.npcKind, "race"))).limit(1);
  if (!owner) return [];
  const rows = await tx.select({ attack: raceNaturalAttack, skillName: skill.name, skillArchived: skill.archivedAt }).from(raceNaturalAttack)
    .leftJoin(skill, eq(skill.id, raceNaturalAttack.skillId)).where(eq(raceNaturalAttack.raceId, owner.raceId)).orderBy(asc(raceNaturalAttack.sortOrder), asc(raceNaturalAttack.id));
  if (!rows.length) return [];
  const lineage = await loadCharacterSkillLineageInputInTransaction(tx, participantId);
  const disabled = combatLimbConditions(owner.local).filter(limb => !limb.recoveredAt).map(limb => limb.poolKey);
  const pools = await tx.select({ poolKey: campaignCharacterActiveHealthPool.poolKey, damage: campaignCharacterActiveHealthPool.damage })
    .from(campaignCharacterActiveHealthPool).where(eq(campaignCharacterActiveHealthPool.characterId, participantId)).orderBy(asc(campaignCharacterActiveHealthPool.poolKey));
  const injuries = await tx.select().from(campaignCharacterInjury).where(and(eq(campaignCharacterInjury.characterId, participantId), eq(campaignCharacterInjury.resolved, false))).orderBy(asc(campaignCharacterInjury.id));
  const body = owner.anatomy ?? createHumanoidRaceAnatomy();
  return rows.map(({ attack, skillName, skillArchived }) => {
    const definition: RaceNaturalAttack = { key: attack.key, attackName: attack.attackName, damage: attack.damage, damageType: attack.damageType, notes: attack.notes,
      authoring: attack.authoring, anatomy: attack.anatomy, skillId: attack.skillId, skillName: skillName ?? "", basisNotes: attack.basisNotes, sortOrder: attack.sortOrder };
    const governance = resolveRaceAttackGovernance(lineage, skillArchived ? null : attack.skillId);
    const requiredPools = new Set([...definition.anatomy.hpPoolIds, ...body.hitLocations.filter(location => definition.anatomy.hitLocationNumbers.includes(location.hitLocationNumber)).flatMap(location => location.hpPoolCanonicalId ? [location.hpPoolCanonicalId] : [])]);
    // Damage and injury prose do not assert usability. Preserve evidence for an
    // explicit ruling when a required part has injuries without a structured fact.
    const injuryEvidence = { pools: pools.filter(pool => requiredPools.has(pool.poolKey) && pool.damage > 0),
      injuries: injuries.filter(injury => requiredPools.has(injury.poolKey ?? "") || definition.anatomy.hitLocationNumbers.includes(injury.hitLocationNumber ?? -1)
        || body.hitLocations.some(location => location.hitLocationNumber === injury.hitLocationNumber && requiredPools.has(location.hpPoolCanonicalId ?? ""))
        || requiredPools.size > 0 && injury.poolKey === null && injury.hitLocationNumber === null)
        .map(injury => ({ id: injury.id, poolKey: injury.poolKey, hitLocationNumber: injury.hitLocationNumber, updatedAt: injury.updatedAt.toISOString() })) };
    const anatomyRulingRequired = injuryEvidence.pools.length > 0 || injuryEvidence.injuries.length > 0;
    return { raceId: owner.raceId, raceName: owner.raceName, anatomy: owner.anatomy, revision: owner.revision, ref: raceNaturalAttackRef(owner.raceId, attack.key), definition, governance, injuryEvidence, anatomyRulingRequired,
      unavailable: raceAttackAnatomyIssue(definition, owner.anatomy, disabled),
      skillDefinitions: lineage.skillCatalog.filter(skill => skill.id === definition.skillId || governance.alternatives.some(alternative => alternative.canonicalPath.rootToEndpoint.some(node => node.id === skill.id))) };
  });
}

export async function resolveRaceNaturalAttackInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, draft: ActionDeclarationDraft): Promise<ResolvedLockedActionSource> {
  if (draft.sourceInstanceId !== null || draft.weaponItemId !== null || draft.firingModeId !== null) throw new Error("A Race Natural Attack cannot use an Item instance, Weapon or firing mode identity.");
  const source = (await readRaceAttackSourcesInTransaction(tx, context, draft.actorCharacterId)).find(entry => entry.ref === draft.sourceRef);
  if (!source) throw new Error("This exact Natural Attack does not belong to the participant's current Normal Race.");
  if (source.unavailable) throw new Error(source.unavailable);
  if (!draft.targetCharacterIds.length || draft.targetCharacterIds.includes(draft.actorCharacterId)) throw new Error("Choose another exact combatant for the Natural Attack.");
  const { definition, governance } = source;
  const selected = governance.selected;
  const resolved: ResolvedLockedActionSource = {
    authoritativeInitiativeCost: definition.authoring.initiativeCost,
    governing: { status: selected ? "resolved" : "needs-god-ruling", source: selected?.rollGoverningSource ?? null, rollOverTarget: selected?.source.originalTarget ?? null, explanation: governance.explanation },
    snapshot: { schemaVersion: 1, kind: "race-natural-attack", identity: source.ref, sourceId: definition.key, sourceInstanceId: null, ownerParticipantId: draft.actorCharacterId,
      displayName: definition.attackName, authoringHref: "/heavens/races", liveRevision: source.revision.toISOString(), resolutionMode: selected ? "opposed-roll" : "manual-god-ruling",
      governingSource: selected?.rollGoverningSource ?? null, governingSnapshot: selected?.rollGoverningSourceSnapshot ?? null,
      authoredData: { ...definition, raceId: source.raceId, raceName: source.raceName, definition, injuryEvidence: source.injuryEvidence, skillDefinitions: source.skillDefinitions, governance, frozenAt: new Date().toISOString(), normalAnatomy: source.anatomy },
      resourceCosts: [], effects: [...definition.authoring.onHitEffects.map(entry => ({ key: `race-hit:${entry.effectKey}`, effect: structuredClone(entry.effect),
        instruction: { naturalAttackHit: true }, applicationSupported: ["health.damage", "condition.apply", "modifier.apply"].includes(entry.effect.kind),
        requiresGodReview: !["health.damage", "condition.apply", "modifier.apply"].includes(entry.effect.kind), targetParticipantIds: draft.targetCharacterIds })),
        ...attachedMagicEffects({ document: definition.authoring.magic?.document, namespace: 'race-attack', actorId: draft.actorCharacterId,
          targets: draft.targetCharacterIds, owner: 'attack', aoe: definition.authoring.mode === 'aoe',
          ownerDistanceFeet: ['feet', 'ft'].includes(String(draft.sourcePayload?.rangeUnit).toLowerCase()) && typeof draft.sourcePayload?.rangeDistance === 'number' ? draft.sourcePayload.rangeDistance : undefined })],
      warnings: [...(!selected ? [governance.explanation] : []), ...(definition.authoring.magic ? ["Supported attached Magic executes after an established hit; manual effects require a G.O.D. ruling. No normal Spell Mana or casting time is added."] : [])] },
  };
  const ruled = await applyRecordedSourceResolutionInTransaction(tx, context, draft, resolved);
  if (source.anatomyRulingRequired && !(ruled.snapshot.authoredData.combatResolutionRuling as { useRequirementsReason?: string } | undefined)?.useRequirementsReason) throw new Error("Required anatomy has damage or an unresolved injury without an authoritative usability fact. The G.O.D. must record whether this attack can use that anatomy.");
  if (ruled.authoritativeInitiativeCost === null || !Number.isFinite(ruled.authoritativeInitiativeCost) || ruled.authoritativeInitiativeCost <= 0) throw new Error("Natural Attack needs an authored positive Initiative Cost or an explicit G.O.D. timing ruling.");
  const mode = definition.authoring.mode;
  if (!mode) throw new Error("Natural Attack needs an authored Attack Mode.");
  const payload = draft.sourcePayload ?? {};
  if (mode === "aoe") {
    const ruling = ruled.snapshot.authoredData.combatResolutionRuling as { targetParticipantIds?: number[] } | undefined;
    if (!ruling?.targetParticipantIds || JSON.stringify([...ruling.targetParticipantIds].sort((a, b) => a - b)) !== JSON.stringify([...draft.targetCharacterIds].sort((a, b) => a - b))) throw new Error("AoE Natural Attack needs a G.O.D.-confirmed exact target set. Notes do not establish area membership.");
    if (draft.calledShot.declared) throw new Error("AoE Natural Attack Called Shots require a separate outcome ruling.");
    return { ...ruled, snapshot: { ...ruled.snapshot, authoredData: { ...ruled.snapshot.authoredData, confirmedAoeTargets: [...draft.targetCharacterIds] }, warnings: [...ruled.snapshot.warnings, "AoE damage and defenses require an explicit outcome ruling for each confirmed target."] } };
  }
  if (draft.targetCharacterIds.length !== 1) throw new Error("Choose one exact target for a melee or ranged Natural Attack.");
  const attackMode = mode === "hybrid" ? payload.rangeAttackMode : mode;
  if (attackMode !== "melee" && attackMode !== "ranged") throw new Error("Choose melee or ranged for this Hybrid Natural Attack.");
  const range = resolveWeaponRange({ profile: { mode, ...definition.authoring.range }, attackMode,
    distance: typeof payload.rangeDistance === "number" ? payload.rangeDistance : null, unit: typeof payload.rangeUnit === "string" ? payload.rangeUnit : null,
    beyondLongModifier: typeof payload.rangeBeyondLongModifier === "number" ? payload.rangeBeyondLongModifier : null, beyondLongReason: typeof payload.rangeBeyondLongReason === "string" ? payload.rangeBeyondLongReason : "" });
  return { ...ruled, snapshot: { ...ruled.snapshot, authoredData: { ...ruled.snapshot.authoredData, range: { ...range, attackMode } } } };
}
