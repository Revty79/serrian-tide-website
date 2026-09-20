import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacterAttribute } from "@/db/realm-schema";
import { getAttributeModifier } from "@/features/characters/character-rules";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Freeze the applicable character inputs alongside the attack, with provenance.
 * A selected weapon's explicit passive rider is excluded from the general pass.
 * Firearm STR/DEX eligibility remains in the existing called-shot calculation. */
export async function readWeaponDamageModifiers(tx: Transaction, characterId: number,
  attribute: "STR" | "DEX" | null, explicitPassiveEffectIds: readonly number[] = []) {
  const [row] = attribute ? await tx.select({ value: campaignCharacterAttribute.value }).from(campaignCharacterAttribute)
    .where(and(eq(campaignCharacterAttribute.characterId, characterId), eq(campaignCharacterAttribute.attributeKey, attribute))).limit(1) : [];
  const active = (await readActiveEffectsInTransaction(tx, characterId)).modifiers.filter((entry) => {
    const effectId = /(?:^|:)power:\d+:effect:(\d+)$/.exec(entry.source.effectKey ?? "")?.[1];
    return entry.endedAt === null && entry.channel === "damage" && entry.targetKey === "self"
      && !(entry.source.kind === "item" && effectId && explicitPassiveEffectIds.includes(Number(effectId)));
  });
  const attributeModifier = row ? getAttributeModifier(row.value) : 0;
  const activeModifier = active.reduce((sum, entry) => sum + entry.amount, 0);
  return { attribute, attributeValue: row?.value ?? null, attributeModifier, activeModifier,
    total: attributeModifier + activeModifier,
    active: active.map(({ id, label, amount, source }) => ({ id, label, amount, source })) };
}
