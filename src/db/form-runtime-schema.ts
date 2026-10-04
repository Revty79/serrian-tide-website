import { sql } from 'drizzle-orm';
import { pgTable, serial, integer, text, timestamp, jsonb, check, index, uniqueIndex, foreignKey, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { campaign } from './campaign-schema';
import { campaignCharacter } from './realm-schema';
import { user } from './auth-schema';
import { race } from './race-schema';
import { creature } from './creature-schema';
import { campaignSessionEncounter, campaignSessionEncounterPendingAction } from './tabletop-operations-schema';
import type { FormTransitionEvidence } from '@/features/forms/form-runtime';
import type { FormReturnDue } from '@/features/forms/form-lifecycle';

export const formTransitionRequest = pgTable('form_transition_request', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(()=>campaignCharacter.id,{onDelete:'restrict'}),
  campaignId: integer('campaign_id').notNull().references(()=>campaign.id,{onDelete:'restrict'}),
  actorUserId: text('actor_user_id').notNull().references(()=>user.id,{onDelete:'restrict'}),
  idempotencyKey: text('idempotency_key').notNull().unique(), requestHash: text('request_hash').notNull(),
  operation: text('operation').$type<'enter'|'return'>().notNull(),
  status: text('status').$type<'pending'|'completed'|'cancelled'>().notNull(),
  encounterId: integer('encounter_id').references(()=>campaignSessionEncounter.id,{onDelete:'restrict'}),
  pendingActionId: integer('pending_action_id').references(()=>campaignSessionEncounterPendingAction.id,{onDelete:'restrict'}),
  evidence: jsonb('evidence').$type<FormTransitionEvidence>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(), completedAt: timestamp('completed_at'),
},t=>[
  check('form_request_positive',sql`${t.characterId}>0`),
  check('form_request_operation',sql`${t.operation} IN ('enter','return')`),
  check('form_request_status',sql`${t.status} IN ('pending','completed','cancelled')`),
  uniqueIndex('form_request_pending_individual').on(t.characterId).where(sql`${t.status}='pending'`),
  uniqueIndex('form_request_pending_action').on(t.pendingActionId), index('form_request_campaign').on(t.campaignId),
]);

export const formTransitionEvent = pgTable('form_transition_event', {
  id: serial('id').primaryKey(),
  requestId: integer('request_id').notNull().unique().references(()=>formTransitionRequest.id,{onDelete:'restrict'}),
  characterId: integer('character_id').notNull().references(()=>campaignCharacter.id,{onDelete:'restrict'}),
  campaignId: integer('campaign_id').notNull().references(()=>campaign.id,{onDelete:'restrict'}),
  operation: text('operation').$type<'enter'|'return'>().notNull(),
  enteredEventId: integer('entered_event_id').references(():AnyPgColumn=>formTransitionEvent.id,{onDelete:'no action'}),
  ownerKind: text('owner_kind').$type<'race'|'creature'>().notNull(),
  sourceRaceId: integer('source_race_id').references(()=>race.id,{onDelete:'restrict'}),
  raceFormId: integer('race_form_id'),
  sourceCreatureId: integer('source_creature_id').references(()=>creature.id,{onDelete:'restrict'}),
  creatureFormId: integer('creature_form_id'),
  formKey: text('form_key').notNull(), sourceHash: text('source_hash').notNull(),
  executedAt: timestamp('executed_at').defaultNow().notNull(),
  evidence: jsonb('evidence').$type<FormTransitionEvidence>().notNull(),
},t=>[
  check('form_event_positive',sql`${t.characterId}>0`),
  check('form_event_identity',sql`(${t.ownerKind}='race' AND ${t.sourceRaceId} IS NOT NULL AND ${t.raceFormId} IS NOT NULL AND ${t.raceFormId}>0 AND ${t.sourceCreatureId} IS NULL AND ${t.creatureFormId} IS NULL) OR (${t.ownerKind}='creature' AND ${t.sourceCreatureId} IS NOT NULL AND ${t.creatureFormId} IS NOT NULL AND ${t.creatureFormId}>0 AND ${t.sourceRaceId} IS NULL AND ${t.raceFormId} IS NULL)`),
  check('form_event_operation',sql`(${t.operation}='enter' AND ${t.enteredEventId} IS NULL) OR (${t.operation}='return' AND ${t.enteredEventId} IS NOT NULL AND ${t.enteredEventId}<>${t.id})`),
  uniqueIndex('form_event_return_once').on(t.enteredEventId),
  uniqueIndex('form_event_character_identity').on(t.id,t.characterId),
  index('form_event_individual').on(t.characterId,t.id), index('form_event_campaign').on(t.campaignId),
]);

/** Absence is Normal. All active identity/evidence comes from the immutable entry. */
export const characterActiveForm = pgTable('campaign_character_active_form', {
  characterId: integer('character_id').primaryKey().references(()=>campaignCharacter.id,{onDelete:'restrict'}),
  entryEventId: integer('entry_event_id').notNull().unique(),
  returnDueJson: jsonb('return_due_json').$type<FormReturnDue>(),
},t=>[
  check('active_form_positive',sql`${t.characterId}>0`),
  foreignKey({name:'active_form_exact_entry',columns:[t.entryEventId,t.characterId],foreignColumns:[formTransitionEvent.id,formTransitionEvent.characterId]}).onDelete('restrict'),
]);

/** A G.O.D. receipt for an authored manual/event refresh; never a use ledger. */
export const formUseResetEvent = pgTable('form_use_reset_event', {
  id: serial('id').primaryKey(),
  characterId: integer('character_id').notNull().references(()=>campaignCharacter.id,{onDelete:'restrict'}),
  campaignId: integer('campaign_id').notNull().references(()=>campaign.id,{onDelete:'restrict'}),
  actorUserId: text('actor_user_id').notNull().references(()=>user.id,{onDelete:'restrict'}),
  requestKey: text('request_key').notNull().unique(), requestHash: text('request_hash').notNull(),
  ownerKind: text('owner_kind').$type<'race'|'creature'>().notNull(),
  sourceId: integer('source_id').notNull(), formId: integer('form_id').notNull(), formKey: text('form_key').notNull(),
  refreshScope: text('refresh_scope').$type<'manual'|'event'>().notNull(), refreshKey: text('refresh_key'),
  afterEntryEventId: integer('after_entry_event_id').references(()=>formTransitionEvent.id,{onDelete:'restrict'}),
  evidence: jsonb('evidence').$type<{ reason: string; definition: FormTransitionEvidence['review']['definition'] }>().notNull(),
  executedAt: timestamp('executed_at').defaultNow().notNull(),
},t=>[
  check('form_reset_positive',sql`${t.characterId}>0 AND ${t.sourceId}>0 AND ${t.formId}>0`),
  check('form_reset_kind',sql`${t.ownerKind} IN ('race','creature')`),
  check('form_reset_scope',sql`(${t.refreshScope}='manual' AND ${t.refreshKey} IS NULL) OR (${t.refreshScope}='event' AND length(trim(${t.refreshKey}))>0 AND ${t.refreshKey} IS NOT NULL)`),
  index('form_reset_individual').on(t.characterId,t.id),
]);
