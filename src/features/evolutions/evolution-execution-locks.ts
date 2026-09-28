import "server-only";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { db } from "@/db";
import * as races from "@/db/race-schema";
import * as creatures from "@/db/creature-schema";
import * as racePaths from "@/db/race-evolution-schema";
import * as creatureRequirements from "@/db/creature-evolution-schema";
import * as access from "@/db/form-access-schema";
import * as abilities from "@/db/derived-ability-schema";
import { raceEvolutionEvent, creatureEvolutionEvent } from "@/db/evolution-event-schema";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignAllowedSystem, campaignPlayer } from "@/db/campaign-schema";
import { campaignRace, campaignAllowedRace, campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile, campaignCharacterAttribute, campaignCharacterSkillAllocation,
  campaignCharacterActiveCondition, campaignCharacterActiveHealth, campaignCharacterActiveHealthPool, campaignCharacterInjury,
  campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { item } from "@/db/item-schema";
import { skill } from "@/db/skill-schema";
import { containerProfile, inventoryInstanceLocation, inventoryStackLocation } from "@/db/container-schema";
import { inventoryContainerAccess, inventoryInstanceCustody, inventoryStackCustody } from "@/db/inventory-access-schema";
import { firearmMagazineAttachment } from "@/db/magazine-schema";
import { campaignSessionEncounter, campaignSessionEncounterParticipant, campaignSessionEncounterInitiative, campaignSessionEncounterInitiativeParticipant } from "@/db/tabletop-operations-schema";

// Existing fact writers do not share one row-lock protocol. A short, fail-fast table
// fence covers inserts as well as updates/deletes, including an individual not yet
// enrolled in an Encounter. Readers remain available. This intentionally trades
// write concurrency for correctness in Pass 3; no runtime writer is rewritten.
// Every table is an explicit trusted schema dependency, never client input.
export const EVOLUTION_FACT_TABLES = [...new Map([
  ...Object.values(races), ...Object.values(creatures), ...Object.values(racePaths),
  ...Object.values(creatureRequirements), ...Object.values(access), ...Object.values(abilities),
  raceEvolutionEvent, creatureEvolutionEvent,
  user, userRole, campaign, campaignAllowedSystem, campaignPlayer, campaignRace, campaignAllowedRace,
  campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile, campaignCharacterAttribute, campaignCharacterSkillAllocation,
  campaignCharacterActiveCondition, campaignCharacterActiveHealth, campaignCharacterActiveHealthPool, campaignCharacterInjury,
  campaignCharacterItem, campaignCharacterItemInstance, item, skill, containerProfile,
  inventoryInstanceLocation, inventoryStackLocation, inventoryContainerAccess, inventoryInstanceCustody, inventoryStackCustody, firearmMagazineAttachment,
  campaignSessionEncounter, campaignSessionEncounterParticipant, campaignSessionEncounterInitiative, campaignSessionEncounterInitiativeParticipant,
].flatMap(value => is(value, PgTable) ? [value as PgTable] : []).map(table => [getTableName(table), table])).values()]
  .sort((a, b) => getTableName(a).localeCompare(getTableName(b)));

export async function lockEvolutionFacts(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  await tx.execute(sql`LOCK TABLE ${sql.join(EVOLUTION_FACT_TABLES.map(table => sql`${table}`), sql`, `)} IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
}
