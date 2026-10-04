import 'server-only';
import type { db } from '@/db';
import { resolveCharacterFormPreview } from '@/features/characters/character-form-preview';
import { resolveCreatureFormPreview } from '@/features/creatures/creature-form-preview';
import type { CharacterDraft } from '@/features/characters/models';
import { loadCharacterSkillLineageInputInTransaction } from '@/features/items/character-weapon-governance-service';
import { readActiveHealthInTransaction } from '@/features/active-state/active-health-service';
import { readEffectiveFormInTransaction } from './effective-form-service';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Presentation consumer of the same pure mechanics used by runtime readers. */
export async function readEffectiveFormViewInTransaction(tx: Tx, characterId: number) {
  const active = await readEffectiveFormInTransaction(tx, characterId);
  if (!active) return null;
  const health = await readActiveHealthInTransaction(tx, characterId, active.kind);
  if (active.kind === 'creature') return { kind: 'creature' as const, health: health.view, hpAdjustment: active.hpAdjustment,
    projection: resolveCreatureFormPreview({ ...active.normal, forms: [active.form] }, active.form.id, active.hpAdjustment)! };
  const lineage = await loadCharacterSkillLineageInputInTransaction(tx, characterId);
  const draft: CharacterDraft = { name: '', profile: active.profile as CharacterDraft['profile'], attributes: active.normalAttributes,
    skillAllocations: lineage.allocations.filter(row => row.id > 0).map(row => ({ draftId: row.id, skillId: row.skillId, points: row.points, parentDraftId: row.parentAllocationId })),
    items: [], itemInstances: [], currencyHoldings: [] };
  const normal = { ...active.normal, formPreview: { ...active.normal.formPreview!, forms: [active.form] } };
  return { kind: 'race' as const, health: health.view, projection: resolveCharacterFormPreview(draft, normal, active.form.id, lineage.skillCatalog)! };
}
export type EffectiveFormView = NonNullable<Awaited<ReturnType<typeof readEffectiveFormViewInTransaction>>>;
