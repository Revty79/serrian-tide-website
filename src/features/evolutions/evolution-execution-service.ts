import { readRaceFormsInTransaction } from "@/features/races/race-form-service";
import { readRaceNaturalAttacksInTransaction } from "@/features/races/race-natural-attack-service";
import { readRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { applyRaceEvolutionTransition, normalizeRaceEvolutionTransition } from "@/features/races/race-evolution-transition";
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign } from "@/db/campaign-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile, campaignCharacterAttribute } from "@/db/realm-schema";
import { race, raceMovementMode, raceSkillLink, raceAttributeCap } from "@/db/race-schema";
import { creature, creatureEvolutionPath } from "@/db/creature-schema";
import { raceEvolutionPath } from "@/db/race-evolution-schema";
import { creatureEvolutionEvent, raceEvolutionEvent } from "@/db/evolution-event-schema";
import { campaignSessionEncounter as encounter, campaignSessionEncounterParticipant as participant, campaignSessionEncounterInitiative as initiative } from "@/db/tabletop-operations-schema";
import type { SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { resolveActiveHealthView } from "@/features/active-state/health-rules";
import { resolveCreatureHealthAnatomy, resolveRaceHealthAnatomy } from "@/features/active-state/anatomy";
import { buildCreatureNpcSnapshot, normalizeCreatureNpcSnapshot, parseCreatureNpcSnapshot, readCreatureNpcTemplateInTransaction } from "@/features/creatures/creature-npc-constructor-service";
import { readCreatureEvolutionEligibilityInTransaction } from "@/features/creatures/evolution-eligibility-service";
import { readRaceEvolutionEligibilityInTransaction } from "@/features/races/evolution-eligibility-service";
import { readEvolutionRequirements as creatureRequirements } from "@/features/creatures/evolution-requirement-service";
import { readEvolutionRequirements as raceRequirements } from "@/features/races/evolution-requirement-service";
import { requireEvolutionId } from "@/features/creatures/creature-evolutions";
import { confirmEvolutionEvaluation, type EvolutionOwner } from "./evolution-requirements";
import { evolutionHealthWarnings, stableEvolutionJson, type EvolutionExecutionInput, type EvolutionExecutionPreview, type EvolutionExecutionResult, type EvolutionHistoryEntry } from "./evolution-execution";
import { lockEvolutionFacts } from "./evolution-execution-locks";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const digest = (value: unknown) => createHash("sha256").update(stableEvolutionJson(value)).digest("hex");
function validateSubject(kind: EvolutionOwner, characterId: number, pathId?: number) {
  if (kind !== "race" && kind !== "creature") throw new Error("Choose Race or Creature Evolution.");
  requireEvolutionId(characterId, "Persistent individual");
  if (pathId !== undefined) requireEvolutionId(pathId, "Evolution path");
}
async function authorize(tx: Tx, characterId: number, actor: SharedLibraryActor) {
  // The caller's role cache is not authoritative at execution time.
  const roles = await tx.select().from(userRole).where(and(eq(userRole.userId, actor.userId), eq(userRole.role, "god")));
  const [row] = await tx.select({ character: campaignCharacter, campaign: campaign, actorName: user.name }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).innerJoin(user, eq(user.id, campaign.createdByUserId))
    .where(eq(campaignCharacter.id, characterId));
  if (!roles.length || !row || row.campaign.createdByUserId !== actor.userId) throw new Error("Only the Campaign-owning G.O.D. may execute or inspect this individual's Evolution.");
  return { ...row, actor: { userId: actor.userId, roles: ["god"] as const } };
}

function meaningfulSnapshot(snapshot: ReturnType<typeof parseCreatureNpcSnapshot>) {
  const normalized = normalizeCreatureNpcSnapshot(snapshot, 0);
  // Descriptive master metadata and cached totals are not individual mechanics.
  const { size, hpMultiplierSteps, baseMovementSteps, baseMagicSteps, interactionRules } = normalized.core;
  return { core: { size, hpMultiplierSteps, baseMovementSteps, baseMagicSteps, interactionRules }, attributes: normalized.attributes,
    movement: normalized.movement, hpPools: normalized.hpPools, hitLocations: normalized.hitLocations,
    attacks: normalized.attacks, abilities: normalized.abilities, skillLinks: normalized.skillLinks,
    defenses: normalized.defenses, forms: normalized.forms ?? [] };
}

function creatureDefinitionSummary(snapshot: ReturnType<typeof parseCreatureNpcSnapshot>) {
  return { size: snapshot.core.size, baseMagic: null, hpMultiplierSteps: snapshot.core.hpMultiplierSteps ?? 0,
    baseMovementSteps: snapshot.core.baseMovementSteps ?? 0, baseMagicSteps: snapshot.core.baseMagicSteps ?? 0,
    attributes: snapshot.attributes.map(row => `${row.attributeKey}: ${row.value ?? "Unknown"}`),
    movement: snapshot.movement.map(row => `${row.movementMode}: ${row.movementValue ?? "Unknown"}`),
    attacks: snapshot.attacks.map(row => `${row.attackName}: ${row.damage ?? "Unspecified damage"}`),
    abilities: snapshot.abilities.map(row => row.abilityName),
    protections: snapshot.defenses.map(row => `${row.defenseType} / ${row.against}: ${row.value ?? "Unspecified"}`),
    skills: snapshot.skillLinks.map(row => `${row.skillName} (#${row.skillId}): ${row.rank}`),
    forms: snapshot.forms?.map(row => row.name) ?? [], interactionRules: snapshot.core.interactionRules?.rules.map(row => row.name) ?? [] };
}

async function raceDefinitionEvidence(tx: Tx, root: typeof race.$inferSelect) {
  const movement = await tx.select().from(raceMovementMode).where(eq(raceMovementMode.raceId, root.id)).orderBy(asc(raceMovementMode.id));
  const skills = await tx.select().from(raceSkillLink).where(eq(raceSkillLink.raceId, root.id)).orderBy(asc(raceSkillLink.id));
  const caps = await tx.select().from(raceAttributeCap).where(eq(raceAttributeCap.raceId, root.id)).orderBy(asc(raceAttributeCap.id));
  const forms = await readRaceFormsInTransaction(tx, root.id);
  const attacks = await readRaceNaturalAttacksInTransaction(tx, root.id);
  const protections = await readRaceNaturalProtectionInTransaction(tx, root.id);
  return { root, movement, skills, caps, forms, attacks, protections };
}
function raceDefinitionSummary(definition: Awaited<ReturnType<typeof raceDefinitionEvidence>>) {
  return { size: definition.root.size, baseMagic: definition.root.baseMagic,
    movement: definition.movement.map(row => `${row.movementMode}: ${row.baseValue}`),
    attacks: definition.attacks.map(row => row.attackName), protections: definition.protections.map(row => `${row.name}: ${row.naturalSoak} Soak`),
    skills: definition.skills.map(row => `Skill #${row.skillId}: ${row.linkType} ${row.value ?? ""}`),
    forms: definition.forms.map(row => row.name), interactionRules: definition.root.interactionRules?.rules.map(row => row.name) ?? [] };
}

async function readPreparation(tx: Tx, kind: EvolutionOwner, characterId: number, pathId: number, actor: SharedLibraryActor) {
  const authorized = await authorize(tx, characterId, actor);
  const { character, campaign: currentCampaign } = authorized;
  if (character.archivedAt || currentCampaign.archivedAt) throw new Error("Restore the individual and Campaign before Evolution.");
  if ((kind === "creature") !== (character.isNpc && character.npcKind === "creature")) throw new Error("Evolution must use the individual's existing Race or Creature type.");
  const evaluation = kind === "race" ? await readRaceEvolutionEligibilityInTransaction(tx, characterId, pathId, authorized.actor)
    : await readCreatureEvolutionEligibilityInTransaction(tx, characterId, pathId, authorized.actor);
  const sourceId = evaluation.owner === "race" ? evaluation.sourceRaceId : evaluation.sourceCreatureId;
  const destinationId = evaluation.owner === "race" ? evaluation.destinationRaceId : evaluation.destinationCreatureId;
  const pathTable = kind === "race" ? raceEvolutionPath : creatureEvolutionPath;
  const [path] = await tx.select({ name: pathTable.name, mode: pathTable.requirementMode }).from(pathTable).where(eq(pathTable.id, pathId));
  const requirements = kind === "race" ? await raceRequirements(tx, pathId, path.mode) : await creatureRequirements(tx, pathId, path.mode);
  const before = await readActiveHealthInTransaction(tx, characterId, character.npcKind);
  let sourceName: string, destinationName: string, afterHealth = before.view, hasIndividualOverrides = false;
  let snapshots: EvolutionHistoryEntry["snapshots"];
  let definitionChanges: EvolutionExecutionPreview["definitionChanges"];
  let definitionEvidence: unknown;
  let raceTransition: EvolutionExecutionPreview["raceTransition"];
  if (kind === "race") {
    const roots = await tx.select().from(race).where(inArray(race.id, [sourceId, destinationId]));
    const source = roots.find(row => row.id === sourceId), destination = roots.find(row => row.id === destinationId);
    if (!source || !destination || source.archivedAt || destination.archivedAt) throw new Error("The exact source and destination must both be active.");
    sourceName = source.name; destinationName = destination.name;
    const sourceDefinition = await raceDefinitionEvidence(tx, source), destinationDefinition = await raceDefinitionEvidence(tx, destination);
    definitionEvidence = { source: sourceDefinition, destination: destinationDefinition };
    definitionChanges = { before: raceDefinitionSummary(sourceDefinition), after: raceDefinitionSummary(destinationDefinition) };
    const [profile] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId));
    const attributes = await tx.select({ attributeKey: campaignCharacterAttribute.attributeKey, value: campaignCharacterAttribute.value }).from(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId, characterId)).orderBy(asc(campaignCharacterAttribute.attributeKey));
    const [authoredPath] = await tx.select({ transition: raceEvolutionPath.transition }).from(raceEvolutionPath).where(eq(raceEvolutionPath.id, pathId));
    const authored = normalizeRaceEvolutionTransition(authoredPath.transition);
    const beforeMechanics = { attributes, hpMultiplierSteps: profile.hpMultiplierSteps, baseMovementSteps: profile.baseMovementSteps, baseMagicSteps: profile.baseMagicSteps };
    const after = applyRaceEvolutionTransition(authored, beforeMechanics);
    raceTransition = { authored, before: beforeMechanics, after };
    afterHealth = resolveActiveHealthView(resolveRaceHealthAnatomy(after.attributes.find(row => row.attributeKey === "CON")!.value, after.hpMultiplierSteps, destination.anatomy), before.state);
  } else {
    const roots = await tx.select().from(creature).where(inArray(creature.id, [sourceId, destinationId]));
    const source = roots.find(row => row.id === sourceId), destination = roots.find(row => row.id === destinationId);
    if (!source || !destination || source.archivedAt || destination.archivedAt) throw new Error("The exact source and destination must both be active.");
    sourceName = source.canonicalName; destinationName = destination.canonicalName;
    const [npc] = await tx.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId));
    const baseline = parseCreatureNpcSnapshot(npc.baselineSnapshotJson, "Source baseline", 0);
    const current = parseCreatureNpcSnapshot(npc.currentSnapshotJson, "Source current", 0);
    if (baseline.id !== sourceId || current.id !== sourceId) throw new Error("The individual snapshots must match the exact source Creature.");
    hasIndividualOverrides = stableEvolutionJson(meaningfulSnapshot(baseline)) !== stableEvolutionJson(meaningfulSnapshot(current));
    const template = await readCreatureNpcTemplateInTransaction(tx, destinationId, { lock: false });
    if (!template) throw new Error("The destination Creature is unavailable.");
    const destinationBaseline = buildCreatureNpcSnapshot(template);
    const destinationCurrent = normalizeCreatureNpcSnapshot(structuredClone(destinationBaseline), npc.hpAdjustment);
    definitionChanges = { before: creatureDefinitionSummary(current), after: creatureDefinitionSummary(destinationCurrent) };
    snapshots = { sourceBaseline: npc.baselineSnapshotJson, sourceCurrent: npc.currentSnapshotJson,
      destinationBaseline: JSON.stringify(destinationBaseline), destinationCurrent: JSON.stringify(destinationCurrent), hpAdjustment: npc.hpAdjustment };
    afterHealth = resolveActiveHealthView(resolveCreatureHealthAnatomy(destinationCurrent, npc.hpAdjustment), before.state);
  }
  const memberships = await tx.select({ status: encounter.status, title: encounter.title, localState: participant.localStateJson,
    snapshot: participant.creatureSnapshotJson, frozenAt: encounter.frozenAt, initiativeId: initiative.encounterId }).from(participant)
    .innerJoin(encounter, eq(encounter.id, participant.encounterId)).leftJoin(initiative, eq(initiative.encounterId, encounter.id))
    .where(and(eq(participant.characterId, characterId), eq(participant.campaignId, character.campaignId))).orderBy(asc(encounter.id));
  const blockers = memberships.flatMap(row => row.status === "active"
    ? [`This individual is participating in active Encounter “${row.title}”. Persistent Evolution is unavailable until the Encounter is complete.`]
    : row.status === "planned" && (row.snapshot !== null || row.localState !== null || row.initiativeId !== null || row.frozenAt !== null)
      ? [`Planned Encounter “${row.title}” already has prepared runtime state. Resolve that preparation before Evolution.`] : []);
  const warnings = evolutionHealthWarnings(before.view, afterHealth);
  warnings.push("Equipment and custody remain unchanged. Review worn and wielded gear against the destination anatomy; Evolution does not reconcile equipment fit.");
  if (hasIndividualOverrides) warnings.push("This Creature has individual mechanical edits. Evolution replaces those mechanics with the destination definition. The prior snapshots remain in Evolution history.");
  const preview: EvolutionExecutionPreview = { kind, characterId, campaignId: character.campaignId, individualName: character.name,
    sourceId, sourceName, destinationId, destinationName, pathId, pathName: path.name, pathVersion: evaluation.pathVersion,
    evaluation, requirements, ...(definitionChanges ? { definitionChanges } : {}), ...(raceTransition ? { raceTransition } : {}), beforeHealth: before.view, afterHealth, hasIndividualOverrides, warnings, blockers, reviewToken: "" };
  preview.reviewToken = digest({ preview, snapshots, definitionEvidence, ownerCharacterId: character.ownerCharacterId });
  return { preview, snapshots, authorized };
}

export async function previewPersistentEvolution(kind: EvolutionOwner, characterId: number, pathId: number, actor: SharedLibraryActor) {
  validateSubject(kind, characterId, pathId);
  return db.transaction(async tx => (await readPreparation(tx, kind, characterId, pathId, actor)).preview,
    { isolationLevel: "repeatable read", accessMode: "read only" });
}

type RaceEvent = typeof raceEvolutionEvent.$inferSelect;
type CreatureEvent = typeof creatureEvolutionEvent.$inferSelect;
function historyEntry(kind: EvolutionOwner, row: RaceEvent | CreatureEvent): EvolutionHistoryEntry {
  return { kind, id: row.id, characterId: row.characterId, executedAt: row.executedAt.toISOString(), executedByUserId: row.executedByUserId,
    evidence: row.evidence, ...("sourceBaselineSnapshotJson" in row ? { snapshots: {
      sourceBaseline: row.sourceBaselineSnapshotJson, sourceCurrent: row.sourceCurrentSnapshotJson,
      destinationBaseline: row.destinationBaselineSnapshotJson, destinationCurrent: row.destinationCurrentSnapshotJson, hpAdjustment: row.hpAdjustment,
    } } : {}) };
}
export async function readEvolutionHistory(characterId: number, actor: SharedLibraryActor): Promise<EvolutionHistoryEntry[]> {
  requireEvolutionId(characterId, "Persistent individual");
  return db.transaction(async tx => {
    await authorize(tx, characterId, actor); // Archives retain readable history.
    const races = await tx.select().from(raceEvolutionEvent).where(eq(raceEvolutionEvent.characterId, characterId)).orderBy(desc(raceEvolutionEvent.id));
    const creatures = await tx.select().from(creatureEvolutionEvent).where(eq(creatureEvolutionEvent.characterId, characterId)).orderBy(desc(creatureEvolutionEvent.id));
    return [...races.map(row => historyEntry("race", row)), ...creatures.map(row => historyEntry("creature", row))].sort((a, b) => b.executedAt.localeCompare(a.executedAt));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function readNextEvolutionPaths(kind: EvolutionOwner, characterId: number, actor: SharedLibraryActor) {
  validateSubject(kind, characterId);
  return db.transaction(async tx => {
    await authorize(tx, characterId, actor);
    if (kind === "race") {
      const [profile] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId));
      if (!profile?.raceId) return [];
      return tx.select({ id: raceEvolutionPath.id, name: raceEvolutionPath.name }).from(raceEvolutionPath).where(eq(raceEvolutionPath.sourceRaceId, profile.raceId)).orderBy(asc(raceEvolutionPath.sortOrder), asc(raceEvolutionPath.id));
    }
    const [profile] = await tx.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId));
    if (!profile) return [];
    return tx.select({ id: creatureEvolutionPath.id, name: creatureEvolutionPath.name }).from(creatureEvolutionPath).where(eq(creatureEvolutionPath.sourceCreatureId, profile.creatureId)).orderBy(asc(creatureEvolutionPath.sortOrder), asc(creatureEvolutionPath.id));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function executePersistentEvolution(input: EvolutionExecutionInput, actor: SharedLibraryActor): Promise<EvolutionExecutionResult> {
  validateSubject(input.kind, input.characterId, input.pathId);
  requireEvolutionId(input.expectedVersion, "Path revision");
  if (typeof input.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{16,120}$/.test(input.idempotencyKey)) throw new Error("A valid durable execution key is required.");
  if (typeof input.reviewToken !== "string" || !/^[a-f0-9]{64}$/.test(input.reviewToken) || !Array.isArray(input.confirmedRequirementKeys)
    || input.confirmedRequirementKeys.length > 1000 || input.confirmedRequirementKeys.some(key => typeof key !== "string")
    || typeof input.confirmHealthConsequences !== "boolean" || typeof input.confirmReplaceOverrides !== "boolean") throw new Error("Review and confirm the current Evolution preview first.");
  const requestHash = digest({ kind: input.kind, characterId: input.characterId, pathId: input.pathId, expectedVersion: input.expectedVersion,
    reviewToken: input.reviewToken, confirmedRequirementKeys: [...input.confirmedRequirementKeys].sort(),
    confirmHealthConsequences: input.confirmHealthConsequences, confirmReplaceOverrides: input.confirmReplaceOverrides, actorId: actor.userId });
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      // Cross-type key namespace. Same-key retries wait for the original transaction.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`persistent-evolution:${input.idempotencyKey}`}, 0))`);
      await authorize(tx, input.characterId, actor);
      const [raceReplay] = await tx.select().from(raceEvolutionEvent).where(eq(raceEvolutionEvent.idempotencyKey, input.idempotencyKey));
      const [creatureReplay] = await tx.select().from(creatureEvolutionEvent).where(eq(creatureEvolutionEvent.idempotencyKey, input.idempotencyKey));
      const previous = raceReplay ?? creatureReplay;
      if (previous) {
        if (previous.requestHash !== requestHash) throw new Error("This execution key was already used with different input. Review the new transition separately.");
        return { event: historyEntry(raceReplay ? "race" : "creature", previous), replayed: true };
      }
      await lockEvolutionFacts(tx);
      const access = await authorize(tx, input.characterId, actor);
      await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, access.character.campaignId)).for("update", { noWait: true });
      await tx.select({ id: encounter.id }).from(encounter).where(eq(encounter.campaignId, access.character.campaignId)).orderBy(asc(encounter.id)).for("update", { noWait: true });
      const individualIds = [input.characterId, ...(access.character.ownerCharacterId ? [access.character.ownerCharacterId] : [])].sort((a, b) => a - b);
      await tx.select({ id: campaignCharacter.id }).from(campaignCharacter).where(inArray(campaignCharacter.id, individualIds)).orderBy(asc(campaignCharacter.id)).for("update", { noWait: true });
      await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, input.characterId)).for("update", { noWait: true });
      await tx.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, input.characterId)).for("update", { noWait: true });
      const pathTable = input.kind === "race" ? raceEvolutionPath : creatureEvolutionPath;
      await tx.select({ id: pathTable.id }).from(pathTable).where(eq(pathTable.id, input.pathId)).for("update", { noWait: true });
      const { preview, snapshots, authorized } = await readPreparation(tx, input.kind, input.characterId, input.pathId, actor);
      if (input.kind === "race") await tx.select({ id: race.id }).from(race).where(inArray(race.id, [preview.sourceId, preview.destinationId])).orderBy(asc(race.id)).for("no key update", { noWait: true });
      else await tx.select({ id: creature.id }).from(creature).where(inArray(creature.id, [preview.sourceId, preview.destinationId])).orderBy(asc(creature.id)).for("no key update", { noWait: true });
      if (preview.pathVersion !== input.expectedVersion) throw new Error("The Evolution path changed. Review its current revision before executing.");
      if (preview.blockers.length) throw new Error(preview.blockers.join(" "));
      const confirmedEvaluation = confirmEvolutionEvaluation(preview.evaluation, input.confirmedRequirementKeys);
      if (confirmedEvaluation.status !== "eligible") throw new Error(confirmedEvaluation.explanation);
      if (input.reviewToken !== preview.reviewToken) throw new Error("The individual's facts or destination mechanics changed. Refresh the preview and review the consequences again.");
      if (!input.confirmHealthConsequences) throw new Error("Confirm the displayed health and equipment consequences before Evolution.");
      if (preview.hasIndividualOverrides && !input.confirmReplaceOverrides) throw new Error("Explicitly confirm replacing this Creature's individual mechanical edits.");
      const { reviewToken: _token, ...evidencePreview } = preview;
      void _token;
      const common = { campaignId: preview.campaignId, characterId: input.characterId, executedByUserId: actor.userId,
        pathId: input.pathId, pathVersion: preview.pathVersion, idempotencyKey: input.idempotencyKey, requestHash,
        evidence: { ...evidencePreview, actorName: authorized.actorName, confirmedEvaluation,
          confirmedRequirementKeys: [...input.confirmedRequirementKeys].sort(), confirmHealthConsequences: input.confirmHealthConsequences, confirmReplaceOverrides: input.confirmReplaceOverrides } };
      if (input.kind === "race") {
        const transition = preview.raceTransition!;
        const profileChanges: Partial<typeof campaignCharacterProfile.$inferInsert> = { raceId: preview.destinationId };
        for (const key of ["hpMultiplierSteps", "baseMovementSteps", "baseMagicSteps"] as const)
          if (transition.authored[key]) profileChanges[key] = transition.after[key];
        await tx.update(campaignCharacterProfile).set(profileChanges).where(eq(campaignCharacterProfile.characterId, input.characterId));
        for (const adjustment of transition.authored.attributes) {
          const value = transition.after.attributes.find(row => row.attributeKey === adjustment.key)!.value;
          await tx.update(campaignCharacterAttribute).set({ value }).where(and(eq(campaignCharacterAttribute.characterId, input.characterId), eq(campaignCharacterAttribute.attributeKey, adjustment.key)));
        }
        const [event] = await tx.insert(raceEvolutionEvent).values({ ...common, sourceRaceId: preview.sourceId, destinationRaceId: preview.destinationId }).returning();
        return { event: historyEntry("race", event), replayed: false };
      }
      if (!snapshots) throw new Error("Destination Creature snapshots could not be prepared.");
      await tx.update(campaignCreatureNpcProfile).set({ creatureId: preview.destinationId,
        baselineSnapshotJson: snapshots.destinationBaseline, currentSnapshotJson: snapshots.destinationCurrent }).where(eq(campaignCreatureNpcProfile.characterId, input.characterId));
      const [event] = await tx.insert(creatureEvolutionEvent).values({ ...common, sourceCreatureId: preview.sourceId, destinationCreatureId: preview.destinationId,
        sourceBaselineSnapshotJson: snapshots.sourceBaseline, sourceCurrentSnapshotJson: snapshots.sourceCurrent,
        destinationBaselineSnapshotJson: snapshots.destinationBaseline, destinationCurrentSnapshotJson: snapshots.destinationCurrent, hpAdjustment: snapshots.hpAdjustment }).returning();
      return { event: historyEntry("creature", event), replayed: false };
    });
  } catch (error) {
    let current: unknown = error;
    while (current && typeof current === "object") {
      if ("code" in current && ["55P03", "40P01", "40001", "57014"].includes(String(current.code))) throw new Error("Related state is being changed by another operation. Refresh the preview and retry; this request made no partial changes.");
      current = "cause" in current ? current.cause : null;
    }
    throw error;
  }
}
