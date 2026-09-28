import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { creature, creatureAttribute, creatureHpPool, creatureHitLocation, challengeRatingReference } from "@/db/creature-schema";
import { assertCanEditSharedLibraryRoot, type SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { cloneCreatureFormsInTransaction } from "./creature-form-service";
import { cloneCreatureEvolutionsInTransaction } from "./creature-evolution-service";
import { normalizeInteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { resolveCreatureHpModel } from "./creature-size-rules";
import { getCreatureKillXpForChallengeRating } from "./challenge-rating";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Copies normal owned authoring once. Caller locks and authorizes the source.
 * Parentage and outgoing Evolution copying are explicit, independent decisions.
 */
export async function copyCreatureDefinitionInTransaction(tx: Transaction, parent: typeof creature.$inferSelect,
  options: { name: string; canonicalId: string; actorUserId: string; parentCreatureId: number | null; copyEvolutions: boolean }) {
  const parentCreatureId = parent.id, { name, canonicalId } = options;
    if (parent.challengeRating === null) {
      throw new Error("The parent Creature has no final Challenge Rating.");
    }
    const rewardReferences = await tx
      .select({
        challengeRating: challengeRatingReference.challengeRating,
        killXp: challengeRatingReference.killXp,
      })
      .from(challengeRatingReference)
      .where(eq(challengeRatingReference.challengeRating, parent.challengeRating))
      .limit(1);
    const killXp = getCreatureKillXpForChallengeRating(
      parent.challengeRating,
      rewardReferences,
    );
    const [parentAttributes, parentPools, parentHitLocations] = await Promise.all([
      tx.select({
        attributeKey: creatureAttribute.attributeKey,
        value: creatureAttribute.value,
      }).from(creatureAttribute).where(and(
        eq(creatureAttribute.creatureId, parentCreatureId),
        isNull(creatureAttribute.variantId),
      )).orderBy(asc(creatureAttribute.sortOrder), asc(creatureAttribute.id)),
      tx.select({
        id: creatureHpPool.id,
        poolName: creatureHpPool.poolName,
        hpPercentage: creatureHpPool.hpPercentage,
        notes: creatureHpPool.notes,
        sortOrder: creatureHpPool.sortOrder,
      }).from(creatureHpPool).where(and(
        eq(creatureHpPool.creatureId, parentCreatureId),
        isNull(creatureHpPool.variantId),
      )).orderBy(asc(creatureHpPool.sortOrder), asc(creatureHpPool.id)),
      tx.select({
        hitLocationNumber: creatureHitLocation.hitLocationNumber,
        locationName: creatureHitLocation.locationName,
        bodyPartsIncluded: creatureHitLocation.bodyPartsIncluded,
        hpPoolId: creatureHitLocation.hpPoolId,
        naturalArmor: creatureHitLocation.naturalArmor,
        soak: creatureHitLocation.soak,
        locationEffect: creatureHitLocation.locationEffect,
        notes: creatureHitLocation.notes,
        sortOrder: creatureHitLocation.sortOrder,
      }).from(creatureHitLocation).where(and(
        eq(creatureHitLocation.creatureId, parentCreatureId),
        isNull(creatureHitLocation.variantId),
      )).orderBy(asc(creatureHitLocation.sortOrder), asc(creatureHitLocation.id)),
    ]);
    const parentHpModel = resolveCreatureHpModel(
      {
        core: parent,
        attributes: parentAttributes,
      },
      parentPools.map((pool) => ({ ...pool, canonicalId: String(pool.id) })),
    );

    const [created] = await tx
      .insert(creature)
      .values({
        canonicalId,
        canonicalName: name,
        interactionRules: normalizeInteractionRuleProfile(parent.interactionRules, "creature"),
        family: parent.family,
        creatureType: parent.creatureType,
        size: parent.size,
        hpMultiplierSteps: parent.hpMultiplierSteps,
        totalHp: parentHpModel.calculatedTotalHp,
        baseMovementSteps: parent.baseMovementSteps,
        baseMagicSteps: parent.baseMagicSteps,
        challengeRating: parent.challengeRating,
        killXp,
        description: parent.description,
        typicalBehavior: parent.typicalBehavior,
        habitatEcology: parent.habitatEcology,
        notes: parent.notes,
        createdByUserId: options.actorUserId,
        sourceSystem: null,
        parentCreatureId: options.parentCreatureId,
        calculatedChallengeRating: parent.calculatedChallengeRating,
        challengeRatingAdjustment: parent.challengeRatingAdjustment,
        challengeRatingAdjustmentReason: parent.challengeRatingAdjustmentReason,
      })
      .returning({ id: creature.id });
    const childToken = canonicalId.startsWith("VAR-") ? canonicalId.slice(4) : canonicalId;

    await tx.execute(sql`
      insert into creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order)
      select ${created.id}, null, attribute_key, value, notes, sort_order
      from creature_attributes where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order)
      select ${created.id}, null, movement_mode, movement_value, initiative, requirements, notes, sort_order
      from creature_movement where creature_id = ${parentCreatureId} and variant_id is null
    `);
    const copiedPoolIds = new Map<number, number>();
    for (const pool of parentHpModel.pools) {
      const parentPoolId = Number(pool.canonicalId);
      const [copied] = await tx.insert(creatureHpPool).values({
        canonicalId: `HP-${childToken}-${String(parentPoolId).padStart(4, "0")}`,
        creatureId: created.id,
        variantId: null,
        poolName: pool.poolName,
        hpPercentage: pool.hpPercentage,
        maximumHp: pool.maximumHp,
        notes: pool.notes,
        sortOrder: pool.sortOrder,
      }).returning({ id: creatureHpPool.id });
      copiedPoolIds.set(parentPoolId, copied.id);
    }
    if (parentHitLocations.length) {
      const copiedLocations = parentHitLocations.map((location) => {
        const hpPoolId = location.hpPoolId === null
          ? null
          : copiedPoolIds.get(location.hpPoolId);
        if (hpPoolId === undefined) {
          throw new Error(`Hit Location ${location.hitLocationNumber} references an unavailable parent HP Pool.`);
        }
        return {
          creatureId: created.id,
          variantId: null,
          hitLocationNumber: location.hitLocationNumber,
          locationName: location.locationName,
          bodyPartsIncluded: location.bodyPartsIncluded,
          hpPoolId,
          naturalArmor: location.naturalArmor,
          soak: location.soak,
          locationEffect: location.locationEffect,
          notes: location.notes,
          sortOrder: location.sortOrder,
        };
      });
      await tx.insert(creatureHitLocation).values(copiedLocations);
    }
    await tx.execute(sql`
      insert into creature_attacks (
        canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage,
        damage_type, range_reach, required_anatomy, requirements, uses_recharge,
        special_effect, notes, sort_order, authoring_json
      )
      select 'ATK-' || ${childToken} || '-' || lpad(id::text, greatest(4, length(id::text)), '0'), ${created.id}, null,
             attack_name, attack_percentage, damage, damage_type, range_reach, required_anatomy,
             requirements, uses_recharge, special_effect, notes, sort_order, authoring_json
      from creature_attacks where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_skill_links (creature_id, variant_id, skill_id, rank, notes, sort_order)
      select ${created.id}, null, skill_id, rank, notes, sort_order
      from creature_skill_links where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_abilities (
        canonical_id, creature_id, variant_id, ability_name, ability_type, activation,
        requirements, uses_recharge, description, mechanical_effect, notes, sort_order, cr_impact, authoring_json
      )
      select 'ABL-' || ${childToken} || '-' || lpad(id::text, greatest(4, length(id::text)), '0'), ${created.id}, null,
             ability_name, ability_type, activation, requirements, uses_recharge, description,
             mechanical_effect, notes, sort_order, cr_impact, authoring_json
      from creature_abilities where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_ability_effects (
        ability_id, effect_key, schema_version, effect_json, sort_order
      )
      select copied_ability.id, source_effect.effect_key, source_effect.schema_version,
             source_effect.effect_json, source_effect.sort_order
      from creature_ability_effects source_effect
      inner join creature_abilities source_ability on source_ability.id = source_effect.ability_id
      inner join creature_abilities copied_ability
        on copied_ability.creature_id = ${created.id}
       and copied_ability.variant_id is null
       and copied_ability.canonical_id = 'ABL-' || ${childToken} || '-' || lpad(source_ability.id::text, greatest(4, length(source_ability.id::text)), '0')
      where source_ability.creature_id = ${parentCreatureId}
        and source_ability.variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_defenses (
        seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order, cr_impact
      )
      select null, ${created.id}, null, defense_type, against, value, notes, sort_order, cr_impact
      from creature_defenses where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order)
      select null, ${created.id}, null, use_name, notes, sort_order
      from creature_uses where creature_id = ${parentCreatureId} and variant_id is null
    `);

    const accessAbilityCopies = await tx.execute<{ source_id: string; copied_id: string }>(sql`
      select source.canonical_id as source_id, copied.canonical_id as copied_id
      from creature_abilities source
      inner join creature_abilities copied on copied.creature_id = ${created.id}
        and copied.variant_id is null
        and copied.canonical_id = 'ABL-' || ${childToken} || '-' || lpad(source.id::text, greatest(4, length(source.id::text)), '0')
      where source.creature_id = ${parentCreatureId} and source.variant_id is null
    `);
    await cloneCreatureFormsInTransaction(tx, parentCreatureId, created.id, new Map(accessAbilityCopies.rows.map(row => [row.source_id, row.copied_id])));
    if (options.copyEvolutions) await cloneCreatureEvolutionsInTransaction(tx, parentCreatureId, created.id, new Map(accessAbilityCopies.rows.map(row => [row.source_id, row.copied_id])));
    return created.id;
}

export async function createDerivedCreatureForActor(parentCreatureId: number, variantName: string, actor: SharedLibraryActor): Promise<number> {
  const name = typeof variantName === "string" ? variantName.trim() : "";
  if (!name) throw new Error("Variant Name is required.");
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .select()
      .from(creature)
      .where(eq(creature.id, parentCreatureId))
      .limit(1).for("no key update");
    if (!parent) throw new Error("Parent Creature not found.");
    assertCanEditSharedLibraryRoot(
      actor,
      parent,
      "Creature",
    );
    if (parent.archivedAt) throw new Error("Restore the parent Creature before creating a derived Creature.");
    let rootId = parentCreatureId;
    let rootCanonicalId = parent.canonicalId;
    let nextParentId = parent.parentCreatureId;
    while (nextParentId !== null) {
      rootId = nextParentId;
      const [ancestor] = await tx
        .select({ canonicalId: creature.canonicalId, parentCreatureId: creature.parentCreatureId })
        .from(creature)
        .where(eq(creature.id, rootId))
        .limit(1);
      if (!ancestor) throw new Error("The parent Creature lineage is incomplete.");
      rootCanonicalId = ancestor.canonicalId;
      nextParentId = ancestor.parentCreatureId;
    }
    const rootToken = rootCanonicalId
      .replace(/^(CR|VAR)-/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLocaleUpperCase("en-US");
    if (!rootToken) throw new Error("The parent Creature ID cannot produce a Variant ID.");

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`serrian-tide:creature-variant:${rootId}`}))`);
    let canonicalId: string | null = null;
    for (let sequence = 1; sequence <= 9999; sequence += 1) {
      const candidate = `VAR-${rootToken}-${String(sequence).padStart(3, "0")}`;
      const [existing] = await tx
        .select({ id: creature.id })
        .from(creature)
        .where(eq(creature.canonicalId, candidate))
        .limit(1);
      if (!existing) {
        canonicalId = candidate;
        break;
      }
    }
    if (!canonicalId) throw new Error("No available Variant ID remains for this Creature family.");

    return copyCreatureDefinitionInTransaction(tx, parent, { name, canonicalId, actorUserId: actor.userId, parentCreatureId, copyEvolutions: true });
  });
}
