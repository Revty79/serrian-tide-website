import 'server-only';
import { asc, eq } from 'drizzle-orm';
import type { db } from '@/db';
import { characterActiveForm, formTransitionEvent } from '@/db/form-runtime-schema';
import { campaignCharacterAttribute, campaignCharacterProfile, campaignCreatureNpcProfile } from '@/db/realm-schema';
import { race, raceMovementMode, raceSkillLink } from '@/db/race-schema';
import { skill } from '@/db/skill-schema';
import type { CharacterDraft, CharacterRaceAggregate } from '@/features/characters/models';
import type { CreatureDraft } from '@/features/creatures/models';
import { projectCreatureFormDefinition, type SavedCreatureForm } from '@/features/creatures/creature-forms';
import { parseCreatureNpcSnapshot, normalizeCreatureNpcSnapshot } from '@/features/creatures/creature-npc-constructor-service';
import { readRaceNaturalAttacksInTransaction } from '@/features/races/race-natural-attack-service';
import { readRaceNaturalProtectionInTransaction } from '@/features/races/race-natural-protection-service';
import type { SavedRaceForm } from '@/features/races/race-forms';
import { emptyRaceFormMechanics } from '@/features/races/race-form-mechanics';
import { resolveRaceFormAttribute, resolveRaceFormMechanics } from './effective-form-mechanics';
import type { FrozenFormDefinition } from './form-runtime';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type EffectiveFormIdentity = { entryEventId: number; kind: 'race' | 'creature'; sourceId: number; formId: number; key: string; name: string };

/** Trusted transaction reader: authorization belongs to the calling runtime owner.
 * No library Form lookup, cached entry, writes or recursive runtime reads. */
export async function readActiveFormDefinitionInTransaction(tx: Tx, characterId: number) {
  if (characterId <= 0) return null;
  const [entry] = await tx.select({ id: formTransitionEvent.id, evidence: formTransitionEvent.evidence })
    .from(characterActiveForm).innerJoin(formTransitionEvent, eq(formTransitionEvent.id, characterActiveForm.entryEventId))
    .where(eq(characterActiveForm.characterId, characterId)).limit(1);
  if (!entry) return null;
  const definition: FrozenFormDefinition = structuredClone(entry.evidence.review.definition);
  const identity: EffectiveFormIdentity = { entryEventId: entry.id, kind: definition.kind, sourceId: definition.sourceId,
    formId: definition.formId, key: definition.key, name: definition.name };
  return { identity, definition };
}

export async function readEffectiveFormInTransaction(tx: Tx, characterId: number) {
  const active = await readActiveFormDefinitionInTransaction(tx, characterId);
  if (!active) return null;
  if (active.definition.kind === 'creature') {
    const [profile] = await tx.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, characterId));
    if (!profile || profile.creatureId !== active.definition.sourceId) throw new Error('Current Form no longer matches the saved Normal Creature identity.');
    const normal = parseCreatureNpcSnapshot(profile.currentSnapshotJson, 'Normal Creature', profile.hpAdjustment);
    const form = active.definition.form as SavedCreatureForm;
    return { ...active, kind: 'creature' as const, form, normal, effective: normalizeCreatureNpcSnapshot(projectCreatureFormDefinition(normal, form.mechanics), profile.hpAdjustment), hpAdjustment: profile.hpAdjustment };
  }
  const [profile] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId));
  if (!profile || profile.raceId !== active.definition.sourceId) throw new Error('Current Form no longer matches the saved Normal Race identity.');
  const [normalRace] = await tx.select().from(race).where(eq(race.id, profile.raceId));
  if (!normalRace) throw new Error('Normal Race is missing.');
  const movementModes = await tx.select({ movementMode: raceMovementMode.movementMode, baseValue: raceMovementMode.baseValue, notes: raceMovementMode.notes })
    .from(raceMovementMode).where(eq(raceMovementMode.raceId, profile.raceId)).orderBy(asc(raceMovementMode.sortOrder), asc(raceMovementMode.id));
  const skillLinks = await tx.select({ skillId: raceSkillLink.skillId, skillName: skill.name, skillClassification: skill.classification, linkType: raceSkillLink.linkType, value: raceSkillLink.value })
    .from(raceSkillLink).innerJoin(skill, eq(skill.id, raceSkillLink.skillId)).where(eq(raceSkillLink.raceId, profile.raceId)).orderBy(asc(raceSkillLink.sortOrder), asc(raceSkillLink.id));
  const attributes = Object.fromEntries((await tx.select().from(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId, characterId))).map(row => [row.attributeKey, row.value])) as CharacterDraft['attributes'];
  const normal: CharacterRaceAggregate = { race: normalRace, movementModes, skillLinks, attributeCaps: [], formPreview: { forms: [],
    naturalAttacks: await readRaceNaturalAttacksInTransaction(tx, profile.raceId), naturalProtections: await readRaceNaturalProtectionInTransaction(tx, profile.raceId), interactionRules: normalRace.interactionRules } };
  const form = active.definition.form as SavedRaceForm;
  return { ...active, kind: 'race' as const, form, normal, normalAttributes: attributes, profile,
    effective: resolveRaceFormMechanics(normal, attributes, form.mechanics ?? emptyRaceFormMechanics()) };
}

/** Narrow overlays preserve each Normal reader's legacy parsing/validation. */
export async function effectiveCreatureSnapshotInTransaction<T>(tx: Tx, characterId: number, normal: T): Promise<T | CreatureDraft> {
  const active = await readEffectiveFormInTransaction(tx, characterId);
  if (active?.kind !== 'creature') return normal;
  return { ...active.effective, currentForm: active.identity,
    attacks: active.effective.attacks.map(row => ({ ...row, normalCanonicalId: row.canonicalId, canonicalId: formBoundSourceRef(row.canonicalId, active.identity) })),
    abilities: active.effective.abilities.map(row => ({ ...row, normalCanonicalId: row.canonicalId, canonicalId: formBoundSourceRef(row.canonicalId, active.identity) })),
    defenses: active.effective.defenses.map((row, index) => ({ ...row, normalSeedIdentity: row.seedIdentity, seedIdentity: formBoundSourceRef(row.seedIdentity ?? `defense:${index}`, active.identity) })),
  } as CreatureDraft;
}
export async function effectiveAttributeInTransaction(tx: Tx, characterId: number, key: keyof CharacterDraft['attributes'], normal: number) {
  const active = await readActiveFormDefinitionInTransaction(tx, characterId);
  return active?.definition.kind === 'race' ? resolveRaceFormAttribute(normal, key, (active.definition.form as SavedRaceForm).mechanics ?? emptyRaceFormMechanics()) : normal;
}

/** Included in source references as well as snapshots, including inherited attacks. */
export function formBoundSourceRef(ref: string, identity: EffectiveFormIdentity | null | undefined) {
  return identity ? `form:${identity.entryEventId}:${ref}` : ref;
}
