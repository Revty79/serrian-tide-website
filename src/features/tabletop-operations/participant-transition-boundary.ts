import 'server-only';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { db } from '@/db';
import {
  campaignSession as session, campaignSessionScene as scene,
  campaignSessionEncounter as encounter, campaignSessionEncounterParticipant as participant,
  campaignSessionEncounterInitiative as initiative, campaignSessionEncounterInitiativeParticipant as enrollment,
  campaignSessionEncounterDeclarationCheckpoint as checkpoint, campaignSessionEncounterActionDeclaration as declaration,
  campaignSessionEncounterPendingAction as pending, campaignSessionEncounterPendingActionSource as binding,
  campaignSessionEncounterReaction as reaction, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterFirearmAttack as firearm, campaignSessionEncounterFirearmBullet as bullet,
  campaignCharacterFirearmPreparation as preparation, campaignSessionPlayerRulingRequest as ruling,
  campaignSessionCalledCheckRequest as calledCheck, campaignSessionCalledCheckBatch as calledBatch,
} from '@/db/tabletop-operations-schema';
import type { EvolutionEncounterContext } from '@/features/evolutions/evolution-execution';

import { formTransitionRequest } from '@/db/form-runtime-schema';

type BoundaryExclusion = { pendingActionId?: number; formRequestId?: number };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Extend the existing fail-fast fact fence to the state inspected below. */
export const PARTICIPANT_TRANSITION_RUNTIME_TABLES = [session, scene, checkpoint, declaration, pending, binding,
  reaction, opportunity, plan, effect, firearm, bullet, preparation, ruling, calledCheck, calledBatch];

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const terminalDeclaration = (status: string) => ['resolved', 'cancelled', 'abandoned'].includes(status);
const terminalPlan = (status: string) => ['applied', 'declined', 'cancelled', 'superseded'].includes(status);
const terminalEffect = (status: string) => ['applied', 'declined', 'manual-resolved'].includes(status);

/** Inspect identity fields in structured runtime evidence, never arbitrary numbers or prose. */
function refersTo(value: unknown, id: number): boolean {
  if (Array.isArray(value)) return value.some(entry => refersTo(entry, id));
  const row = object(value);
  const singles = ['actorCharacterId', 'actorParticipantId', 'casterCharacterId', 'sourceCharacterId', 'targetCharacterId', 'targetParticipantId',
    'protectedTargetCharacterId', 'reactorCharacterId', 'responderCharacterId', 'recipientCharacterId', 'participantId'];
  const multiples = ['targetCharacterIds', 'targetParticipantIds'];
  return singles.some(key => row[key] === id) || multiples.some(key => Array.isArray(row[key]) && row[key].includes(id))
    || Object.values(object(row.targetGroups)).some(ids => Array.isArray(ids) && ids.includes(id))
    || Object.values(row).some(entry => entry && typeof entry === 'object' && refersTo(entry, id));
}

async function unfinishedOperations(tx: Tx, current: typeof encounter.$inferSelect, characterId: number, exclude: BoundaryExclusion) {
  const encounterId = current.id;
  const checkpoints = await tx.select().from(checkpoint).where(eq(checkpoint.encounterId, encounterId)).orderBy(asc(checkpoint.id));
  const declarations = await tx.select().from(declaration).where(eq(declaration.encounterId, encounterId)).orderBy(asc(declaration.id));
  const actions = (await tx.select().from(pending).where(eq(pending.encounterId, encounterId)).orderBy(asc(pending.id))).filter(row => row.id !== exclude.pendingActionId);
  const bindings = await tx.select().from(binding).where(eq(binding.encounterId, encounterId)).orderBy(asc(binding.id));
  const reactions = await tx.select().from(reaction).where(eq(reaction.encounterId, encounterId)).orderBy(asc(reaction.id));
  const opportunities = await tx.select().from(opportunity).where(eq(opportunity.encounterId, encounterId)).orderBy(asc(opportunity.id));
  const plans = await tx.select().from(plan).where(eq(plan.encounterId, encounterId)).orderBy(asc(plan.id));
  const effects = await tx.select().from(effect).where(eq(effect.encounterId, encounterId)).orderBy(asc(effect.id));
  const firearms = await tx.select().from(firearm).where(eq(firearm.encounterId, encounterId)).orderBy(asc(firearm.id));
  const preparations = await tx.select().from(preparation).where(eq(preparation.encounterId, encounterId)).orderBy(asc(preparation.id));
  const rulings = await tx.select().from(ruling).where(eq(ruling.encounterId, encounterId)).orderBy(asc(ruling.id));
  const checks = await tx.select().from(calledCheck).where(and(eq(calledCheck.recipientCharacterId, characterId),
    or(eq(calledCheck.encounterId, encounterId), and(isNull(calledCheck.encounterId), eq(calledCheck.sessionId, current.sessionId),
      or(isNull(calledCheck.sceneId), eq(calledCheck.sceneId, current.sceneId)))))).orderBy(asc(calledCheck.id));
  const blockers: EvolutionEncounterContext['operations'] = [];
  const add = (kind: string, id: number, status: string, explanation: string) => blockers.push({ kind, id, status, explanation });
  const involvedDeclaration = (row: typeof declaration.$inferSelect) => row.actorCharacterId === characterId
    || refersTo(row.draftJson, characterId) || refersTo(row.lockedSnapshotJson, characterId);
  const declarationFor = (id: number | null) => declarations.find(row => row.id === id);
  const liveDeclaration = (id: number | null) => { const row = declarationFor(id); return !!row && !terminalDeclaration(row.status); };
  const liveAction = (id: number | null) => actions.some(row => row.id === id && ['active', 'interrupted'].includes(row.status));

  for (const row of checkpoints) if (!row.revealedAt && (row.participantIdsJson.includes(characterId)
    || declarations.some(entry => entry.checkpointId === row.id && involvedDeclaration(entry)))) {
    add('checkpoint', row.id, 'open', 'Finish the simultaneous declaration checkpoint involving this individual.');
  }
  for (const row of declarations) if (!terminalDeclaration(row.status) && involvedDeclaration(row)) {
    add('declaration', row.id, row.status, row.actorCharacterId === characterId
      ? 'This individual has an unfinished declaration.' : 'An unfinished declaration targets or mechanically involves this individual.');
  }
  for (const row of actions) if (['active', 'interrupted'].includes(row.status) && (row.actorCharacterId === characterId
    || declarations.some(entry => entry.pendingActionId === row.id && involvedDeclaration(entry)))) {
    add('initiative-action', row.id, row.status, 'Finish or abandon the pending Initiative action involving this individual.');
  }
  for (const row of bindings) {
    const action = actions.find(entry => entry.id === row.pendingActionId);
    const owner = declarations.find(entry => entry.pendingActionId === row.pendingActionId);
    if (!['pending', 'needs-ruling'].includes(row.resolutionStatus) || !action || ['abandoned', 'ended'].includes(action.status)
      || owner && terminalDeclaration(owner.status) && !liveAction(action.id)) continue;
    let payload: unknown;
    try { payload = JSON.parse(row.payloadJson); } catch { payload = null; }
    if (row.sourceCharacterId === characterId || refersTo(payload, characterId)) {
      add('source-resolution', row.id, row.resolutionStatus, 'Resolve the prepared source outcome involving this individual.');
    }
  }
  for (const row of reactions) if (['declared', 'needs-ruling'].includes(row.status)
    && ([row.reactorCharacterId, row.protectedTargetCharacterId, row.targetCharacterId].includes(characterId)
      || refersTo(row.declarationSnapshotJson, characterId)
      || declarations.some(entry => entry.pendingActionId === row.pendingActionId && involvedDeclaration(entry))
      || actions.some(action => action.id === row.pendingActionId && action.actorCharacterId === characterId))) {
    add('reaction', row.id, row.status, 'Resolve the defense/reaction in which this individual acts, is targeted or is protected.');
  }
  for (const row of opportunities) if (['pending', 'response-declared'].includes(row.status)
    && (liveDeclaration(row.declarationId) || liveAction(row.pendingActionId)
      || reactions.some(entry => entry.id === row.reactionId && ['declared', 'needs-ruling'].includes(entry.status)))
    && (row.responderCharacterId === characterId || declarations.some(entry => entry.id === row.declarationId && involvedDeclaration(entry)))) {
    add('response-opportunity', row.id, row.status, 'Resolve or decline this individual\'s pending response involvement.');
  }
  for (const row of plans) {
    const subjects = effects.filter(entry => entry.planId === row.id);
    const involved = row.actorParticipantId === characterId || subjects.some(entry => entry.targetParticipantId === characterId)
      || refersTo(row.targetSnapshotJson, characterId) || refersTo(row.sourceSnapshotJson, characterId);
    if (!involved || ['declined', 'cancelled', 'superseded'].includes(row.status)) continue;
    if (!terminalPlan(row.status) || subjects.some(entry => !terminalEffect(entry.status))) {
      add('effect-plan', row.id, row.status, 'Finish reviewing and applying the Action Effect Plan involving this individual.');
    }
  }
  for (const row of firearms) {
    if (row.status === 'cancelled' || ![row.actorParticipantId, row.targetParticipantId].includes(characterId)) continue;
    // Attack status can retain consequence-planned or requires-god-ruling after
    // the plan has been resolved. Use the committed roll, portions and outcomes.
    const finished = row.attackRollId !== null && !liveDeclaration(row.triggerDeclarationId)
      && !liveAction(row.triggerPendingActionId) && (object(object(row.frozenSnapshotJson).delivery).kind !== 'sustained' || row.firingPortionsResolved >= row.firingDurationInitiative)
      && plans.some(entry => entry.id === row.effectPlanId && terminalPlan(entry.status));
    if (!finished) add('firearm-attack', row.id, row.status, 'Finish the firearm attack and every firing portion involving this individual.');
  }
  for (const row of preparations) if (row.characterId === characterId && ['pending', 'interrupted', 'requires-god-ruling'].includes(row.status)) {
    add('firearm-preparation', row.id, row.status, 'Finish or cancel the prepared firearm operation before changing Form, Evolution or historical Return.');
  }
  for (const row of rulings) if (['pending', 'clarification-requested'].includes(row.status)
    && (row.characterId === characterId || row.targetParticipantId === characterId || refersTo(row.frozenRequestJson, characterId))
    && (liveDeclaration(row.linkedDeclarationId) || liveAction(declarationFor(row.linkedDeclarationId)?.pendingActionId ?? null)
      || reactions.some(entry => entry.id === row.linkedReactionId && ['declared', 'needs-ruling'].includes(entry.status))
      || blockers.some(entry => entry.kind === 'firearm-attack' && entry.id === row.linkedFirearmAttackId))) {
    add('combat-ruling', row.id, row.status, 'Resolve the source, range or Called Shot ruling bound to the unfinished operation.');
  }
  for (const row of checks) if (row.recipientCharacterId === characterId && ['pending', 'answered', 'requires-god-ruling'].includes(row.status)) {
    add('called-check', row.id, row.status, 'Finish the Encounter check prepared against this individual\'s current mechanics.');
  }
  const transformations = await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.encounterId, encounterId), eq(formTransitionRequest.characterId, characterId), eq(formTransitionRequest.status, 'pending')));
  for (const row of transformations) if (row.id !== exclude.formRequestId) add('form-transition', row.id, row.status, 'Finish or cancel this individual\'s pending Form transition.');
  return blockers;
}

/** Reads only. Commit calls this again under the existing Evolution/Encounter fence. */
export async function readParticipantTransitionBoundary(tx: Tx, characterId: number, campaignId: number, exclude: BoundaryExclusion = {}) {
  const memberships = await tx.select({ encounter, participant, initiative, enrollment,
    sessionName: session.title, sceneName: scene.title }).from(participant)
    .innerJoin(encounter, eq(encounter.id, participant.encounterId))
    .innerJoin(session, eq(session.id, encounter.sessionId)).innerJoin(scene, eq(scene.id, encounter.sceneId))
    .leftJoin(initiative, eq(initiative.encounterId, encounter.id))
    .leftJoin(enrollment, and(eq(enrollment.encounterId, encounter.id), eq(enrollment.characterId, characterId)))
    .where(and(eq(participant.characterId, characterId), eq(participant.campaignId, campaignId), inArray(encounter.status, ['active', 'planned'])))
    .orderBy(asc(encounter.id));
  const contexts: EvolutionEncounterContext[] = [];
  for (const row of memberships) {
    if (row.encounter.status === 'completed') continue;
    const operations = await unfinishedOperations(tx, row.encounter, characterId, exclude);
    const prepared = row.participant.creatureSnapshotJson !== null || row.participant.localStateJson !== null || row.initiative !== null
      || row.enrollment !== null || row.encounter.frozenAt !== null || operations.length > 0;
    const reasons = row.encounter.status === 'planned'
      ? prepared ? ['This planned Encounter already has prepared runtime state. Resolve its preparation before changing Form, Evolution or historical Return.'] : []
      : row.encounter.frozenAt ? ['This active Encounter is frozen for inspection. Resume it before changing Form, Evolution or historical Return.'] : [];
    reasons.push(...operations.map(entry => `${entry.explanation} (${entry.kind} #${entry.id}: ${entry.status})`));
    contexts.push({ encounterId: row.encounter.id, encounterName: row.encounter.title, encounterType: row.encounter.encounterType,
      encounterStatus: row.encounter.status, sessionId: row.encounter.sessionId, sessionName: row.sessionName,
      sceneId: row.encounter.sceneId, sceneName: row.sceneName, participantId: row.participant.participantId, characterId,
      participantStatus: row.enrollment?.participationStatus ?? 'not-enrolled', currentInitiative: row.enrollment?.currentInitiative ?? null,
      round: row.initiative?.roundNumber ?? null, step: row.initiative?.stepNumber ?? null, timelineInitiative: row.initiative?.timelineInitiative ?? null,
      frozen: row.encounter.frozenAt !== null, cleanBoundary: reasons.length === 0, blockers: reasons, operations });
  }
  return { contexts, blockers: contexts.flatMap(context => context.blockers.map(reason => `Encounter "${context.encounterName}": ${reason}`)) };
}
