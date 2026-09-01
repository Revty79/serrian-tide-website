import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq, sql } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  campaignCharacterInjury,
  campaignCharacterItem,
  campaignCharacterProfile,
} from "@/db/realm-schema";
import {
  applyConditionInTransaction,
  applyModifierInTransaction,
  endModifierInTransaction,
  getActiveModifierTotalInTransaction,
  readActiveEffectsInTransaction,
  resolveConditionInTransaction,
} from "@/features/active-state/active-effects-service";
import {
  lockActiveHealthInTransaction,
  persistActiveHealthStateInTransaction,
  readActiveHealthInTransaction,
} from "@/features/active-state/active-health-service";
import {
  readActiveManaInTransaction,
  restoreActiveManaInTransaction,
  restoreActiveManaPoolInTransaction,
  spendActiveManaInTransaction,
} from "@/features/active-state/active-mana-service";
import {
  applyAreaHealing,
  applyFullBodyHealing,
  applyLocalizedDamage,
  resolveLocalizedDamageTarget,
  restoreAllHealth,
} from "@/features/active-state/health-rules";
import { persistPlannedMechanicalEffectInTransaction } from "@/features/active-state/mechanical-effect-service";
import {
  canInitiateSpellCast,
  canTargetSpellCast,
  executeSpellCastInTransaction,
  getSpellCastApplicationKey,
  planSpellCast,
  type LoadedSpellCastSource,
  type SpellCastPlan,
  type SpellCastTargetContext,
} from "@/features/characters/character-spell-runtime";
import {
  creatureAbilityApplicationKey,
  executeCreatureAbilityUseInTransaction,
  planCreatureAbilityUse,
} from "@/features/creatures/creature-ability-runtime";
import { normalizeCreatureAbilityDefinition } from "@/features/creatures/creature-ability";
import {
  lockEquipmentStateCharacterInTransaction,
  readCharacterEquipmentStateInTransaction,
  reconcileItemPassiveEffectsInTransaction,
} from "@/features/items/equipment-state-service";
import {
  readCharacterItemChargeStateInTransaction,
  readItemChargeStateInTransaction,
  restoreItemChargesFullInTransaction,
  restoreItemChargesInTransaction,
  setItemCurrentChargesInTransaction,
  spendItemChargesInTransaction,
} from "@/features/items/item-charge-service";
import {
  executeItemUseInTransaction,
  planItemUse,
  type ItemUseDefinition,
  type ItemUsePlan,
  type ItemUseResource,
} from "@/features/items/item-use";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { auth } from "@/lib/auth";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for real PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing real Runtime Foundation tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing real Runtime Foundation tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const GOD_ID = "step13-god";
const PLAYER_ID = "step13-player";
const CAMPAIGN_NAME = "Runtime Foundation Local Review";

type Fixtures = {
  campaignId: number;
  playerCharacterId: number;
  raceNpcId: number;
  creatureNpcId: number;
  armorItemId: number;
  chargedItemId: number;
  chargedInstanceIds: number[];
};

let fixtures: Fixtures;

async function loadFixtures(): Promise<Fixtures> {
  const result = await pool.query<{
    campaign_id: number;
    player_character_id: number;
    race_npc_id: number;
    creature_npc_id: number;
    armor_item_id: number;
    charged_item_id: number;
  }>(`
    select
      c.id as campaign_id,
      max(cc.id) filter (where cc.name='Mara Tidewright') as player_character_id,
      max(cc.id) filter (where cc.name='Archivist Rowan') as race_npc_id,
      max(cc.id) filter (where cc.name='Brine, the Review Beast') as creature_npc_id,
      max(i.id) filter (where i.canonical_id='DEV-STEP13-ARMOR') as armor_item_id,
      max(i.id) filter (where i.canonical_id='DEV-STEP13-CHARGED') as charged_item_id
    from campaign c
    join campaign_character cc on cc.campaign_id=c.id
    cross join items i
    where c.name=$1
    group by c.id
  `, [CAMPAIGN_NAME]);
  assert.equal(result.rows.length, 1, "Step 13 development fixtures must be seeded first.");
  const row = result.rows[0]!;
  for (const [key, value] of Object.entries(row)) {
    assert.ok(Number.isInteger(value) && value > 0, `Fixture ${key} is missing.`);
  }
  const copies = await pool.query<{ id: number }>(`
    select id from campaign_character_item_instance
    where character_id=$1 and item_id=$2 order by id
  `, [row.player_character_id, row.charged_item_id]);
  assert.equal(copies.rows.length, 2);
  return {
    campaignId: row.campaign_id,
    playerCharacterId: row.player_character_id,
    raceNpcId: row.race_npc_id,
    creatureNpcId: row.creature_npc_id,
    armorItemId: row.armor_item_id,
    chargedItemId: row.charged_item_id,
    chargedInstanceIds: copies.rows.map(({ id }) => id),
  };
}

async function clearActiveState(characterIds = [
  fixtures.playerCharacterId,
  fixtures.raceNpcId,
  fixtures.creatureNpcId,
]): Promise<void> {
  await pool.query("delete from campaign_character_active_condition where character_id=any($1::int[])", [characterIds]);
  await pool.query("delete from campaign_character_active_modifier where character_id=any($1::int[])", [characterIds]);
  await pool.query("delete from campaign_character_active_mana where character_id=any($1::int[])", [characterIds]);
  await pool.query("delete from campaign_character_active_health where character_id=any($1::int[])", [characterIds]);
}

async function persistedHealth(characterId: number, npcKind: "race" | "creature" = "race") {
  return db.transaction((tx) => readActiveHealthInTransaction(tx, characterId, npcKind));
}

async function setCharges(instanceId: number, currentCharges: number) {
  return db.transaction((tx) => setItemCurrentChargesInTransaction(tx, {
    characterId: fixtures.playerCharacterId,
    itemId: fixtures.chargedItemId,
    instanceId,
    currentCharges,
  }));
}

async function loadItemDefinition(canonicalId: string): Promise<ItemUseDefinition> {
  const itemResult = await pool.query<{
    id: number;
    name: string;
    use_mode: ItemUseDefinition["runtimeProfile"]["useMode"];
    quantity_per_use: number | null;
    maximum_charges: number | null;
    charges_per_use: number | null;
    recharge_notes: string;
    activation_label: string;
    use_notes: string;
  }>(`
    select i.id,i.name,p.use_mode,p.quantity_per_use,p.maximum_charges,p.charges_per_use,
           p.recharge_notes,p.activation_label,p.use_notes
    from items i join item_runtime_profiles p on p.item_id=i.id
    where i.canonical_id=$1
  `, [canonicalId]);
  assert.equal(itemResult.rows.length, 1);
  const itemRow = itemResult.rows[0]!;
  const effects = await pool.query<{
    id: number;
    schema_version: number;
    effect_json: unknown;
    sort_order: number;
  }>("select id,schema_version,effect_json,sort_order from item_effects where item_id=$1 order by sort_order,id", [itemRow.id]);
  return {
    id: itemRow.id,
    name: itemRow.name,
    runtimeProfile: {
      useMode: itemRow.use_mode,
      quantityPerUse: itemRow.quantity_per_use,
      maximumCharges: itemRow.maximum_charges,
      chargesPerUse: itemRow.charges_per_use,
      rechargeNotes: itemRow.recharge_notes,
      activationLabel: itemRow.activation_label,
      useNotes: itemRow.use_notes,
    },
    effects: effects.rows.map((row) => ({
      id: row.id,
      schemaVersion: row.schema_version,
      effectJson: row.effect_json,
      sortOrder: row.sort_order,
    })),
  };
}

async function useFixtureItem(input: {
  canonicalId: string;
  targetCharacterId?: number;
  targetNpcKind?: "race" | "creature";
  instanceId?: number;
  hitLocationNumber?: number;
  poolKey?: string;
}) {
  const definition = await loadItemDefinition(input.canonicalId);
  const targetCharacterId = input.targetCharacterId ?? fixtures.playerCharacterId;
  const targetNpcKind = input.targetNpcKind ?? "race";
  let currentPlan: ItemUsePlan | null = null;
  let targetAnatomy: Awaited<ReturnType<typeof readActiveHealthInTransaction>>["anatomy"] | null = null;
  return executeItemUseInTransaction((execute) => db.transaction(async (tx) => execute({
    loadAndPlan: async () => {
      await lockEquipmentStateCharacterInTransaction(tx, fixtures.playerCharacterId);
      const health = await readActiveHealthInTransaction(tx, targetCharacterId, targetNpcKind);
      targetAnatomy = health.anatomy;
      let resource: ItemUseResource;
      if (definition.runtimeProfile.useMode === "charges") {
        assert.ok(input.instanceId);
        const charge = await readItemChargeStateInTransaction(tx, {
          characterId: fixtures.playerCharacterId,
          itemId: definition.id,
          instanceId: input.instanceId,
        }, true);
        resource = { kind: "instance", instanceId: input.instanceId, currentCharges: charge.currentCharges };
      } else {
        const [owned] = await tx.select({ quantity: campaignCharacterItem.quantity })
          .from(campaignCharacterItem)
          .where(and(
            eq(campaignCharacterItem.characterId, fixtures.playerCharacterId),
            eq(campaignCharacterItem.itemId, definition.id),
          )).limit(1).for("update");
        resource = { kind: "stack", quantity: owned?.quantity ?? 0 };
      }
      const selections = Object.fromEntries(definition.effects.map(({ id }) => [String(id), {
        hitLocationNumber: input.hitLocationNumber,
        poolKey: input.poolKey,
      }]));
      currentPlan = planItemUse({
        definition,
        resource,
        requestedItemInstanceId: input.instanceId ?? null,
        target: {
          characterId: targetCharacterId,
          name: `Character ${targetCharacterId}`,
          anatomy: health.anatomy,
          state: health.state,
        },
        effectSelections: selections,
      });
      return currentPlan;
    },
    consumeResource: async (resource) => {
      if (resource.kind === "instance") {
        await spendItemChargesInTransaction(tx, {
          characterId: fixtures.playerCharacterId,
          itemId: definition.id,
          instanceId: resource.instanceId,
        });
      } else if (resource.useMode === "consume-item") {
        await tx.update(campaignCharacterItem).set({ quantity: resource.after }).where(and(
          eq(campaignCharacterItem.characterId, fixtures.playerCharacterId),
          eq(campaignCharacterItem.itemId, definition.id),
        ));
      }
    },
    applyAutomaticEffect: async (effect) => {
      assert.ok(currentPlan && targetAnatomy);
      await persistPlannedMechanicalEffectInTransaction(tx, {
        plan: effect.plan,
        targetCharacterId,
        sourceEffectKey: String(effect.effectId),
        targetAnatomy,
      });
    },
  })));
}

async function loadSpellPlan(documentId: string, targetCharacterId: number, selection?: { hitLocationNumber?: number; poolKey?: string }): Promise<SpellCastPlan> {
  return db.transaction(async (tx) => {
    const spellRows = await tx.execute(sql<{
      id: number;
      document_id: string;
      document_json: string;
      in_spellbook: boolean;
    }>`select id,document_id,document_json,in_spellbook from campaign_character_spell_document
       where character_id=${fixtures.playerCharacterId} and document_id=${documentId}`);
    const spellRow = spellRows.rows[0] as { id: number; document_id: string; document_json: string; in_spellbook: boolean } | undefined;
    assert.ok(spellRow?.in_spellbook);
    const spell = parseSpellDocument(JSON.parse(spellRow.document_json));
    const mana = await readActiveManaInTransaction(tx, fixtures.playerCharacterId);
    const spellMana = mana.pools.find(({ system }) => system === spell.castingSystem);
    if (!spell.castingSystem || !spellMana || !spellMana.spellAccessLevel) throw new Error("Fixture Spell casting context is incomplete.");
    const targetHealth = await readActiveHealthInTransaction(tx, targetCharacterId, "race");
    const targetContainer = spell.containers.find(({ containerRuleId }) => containerRuleId === "target" || containerRuleId === "aoe");
    const automaticEffects = targetContainer?.effects.filter(({ ruleId }) => ruleId === "damage" || ruleId === "healing") ?? [];
    const applications = Object.fromEntries(automaticEffects.map((effect) => [
      getSpellCastApplicationKey(effect.id, targetCharacterId),
      selection ?? {},
    ]));
    const source: LoadedSpellCastSource = {
      kind: "personal",
      identity: `personal:${spellRow.id}`,
      label: "Personal Spellbook Spell",
      spell,
      circumstance: "have-spell",
    };
    return planSpellCast({
      source,
      caster: {
        characterId: fixtures.playerCharacterId,
        campaignId: fixtures.campaignId,
        name: "Mara Tidewright",
        system: spell.castingSystem,
        practitionerLevel: spellMana.spellAccessLevel,
        mana: spellMana,
      },
      targets: [{
        characterId: targetCharacterId,
        campaignId: fixtures.campaignId,
        name: `Character ${targetCharacterId}`,
        isNpc: targetCharacterId !== fixtures.playerCharacterId,
        npcKind: "race",
        anatomy: targetHealth.anatomy,
        state: targetHealth.state,
      }],
      selections: {
        targetGroups: targetContainer && automaticEffects.length ? { [targetContainer.id]: [targetCharacterId] } : {},
        applications,
      },
    });
  });
}

async function executeSavedSpell(documentId: string, targetCharacterId: number, selection?: { hitLocationNumber?: number; poolKey?: string }, failAfterAutomatic = false) {
  let anatomy: SpellCastTargetContext["anatomy"] | null = null;
  return executeSpellCastInTransaction((execute) => db.transaction(async (tx) => execute({
    loadAndPlan: async () => {
      const spellRows = await tx.execute(sql<{ id: number; document_json: string }>`
        select id,document_json from campaign_character_spell_document
        where character_id=${fixtures.playerCharacterId} and document_id=${documentId} and in_spellbook=true
      `);
      const spellRow = spellRows.rows[0] as { id: number; document_json: string } | undefined;
      assert.ok(spellRow);
      const spell = parseSpellDocument(JSON.parse(spellRow.document_json));
      const manaView = await readActiveManaInTransaction(tx, fixtures.playerCharacterId);
      const spellMana = manaView.pools.find(({ system }) => system === spell.castingSystem);
      if (!spell.castingSystem || !spellMana || !spellMana.spellAccessLevel) throw new Error("Fixture Spell casting context is incomplete.");
      const targetHealth = await lockActiveHealthInTransaction(tx, targetCharacterId, "race");
      anatomy = targetHealth.anatomy;
      const targetContainer = spell.containers.find(({ containerRuleId }) => containerRuleId === "target" || containerRuleId === "aoe");
      const automaticEffects = targetContainer?.effects.filter(({ ruleId }) => ruleId === "damage" || ruleId === "healing") ?? [];
      const source: LoadedSpellCastSource = {
        kind: "personal",
        identity: `personal:${spellRow.id}`,
        label: "Personal Spellbook Spell",
        spell,
        circumstance: "have-spell",
      };
      return planSpellCast({
        source,
        caster: {
          characterId: fixtures.playerCharacterId,
          campaignId: fixtures.campaignId,
          name: "Mara Tidewright",
          system: spell.castingSystem,
          practitionerLevel: spellMana.spellAccessLevel,
          mana: spellMana,
        },
        targets: [{
          characterId: targetCharacterId,
          campaignId: fixtures.campaignId,
          name: `Character ${targetCharacterId}`,
          isNpc: targetCharacterId !== fixtures.playerCharacterId,
          npcKind: "race",
          anatomy: targetHealth.anatomy,
          state: targetHealth.state,
        }],
        selections: {
          targetGroups: targetContainer && automaticEffects.length ? { [targetContainer.id]: [targetCharacterId] } : {},
          applications: Object.fromEntries(automaticEffects.map((effect) => [
            getSpellCastApplicationKey(effect.id, targetCharacterId),
            selection ?? {},
          ])),
        },
      });
    },
    spendMana: (plan) => spendActiveManaInTransaction(tx, {
      characterId: fixtures.playerCharacterId,
      system: plan.caster.system,
      amount: plan.finalManaCost,
    }),
    applyAutomaticEffect: async (application) => {
      assert.ok(anatomy);
      await persistPlannedMechanicalEffectInTransaction(tx, {
        plan: application.plan,
        targetCharacterId: application.targetCharacterId,
        sourceEffectKey: application.spellEffectId,
        targetAnatomy: anatomy,
      });
      if (failAfterAutomatic) throw new Error("Step 13 simulated Spell persistence failure");
    },
  })), true);
}

after(async () => {
  await pool.end();
});

test("Runtime Foundation real PostgreSQL freeze", { concurrency: false }, async (t) => {
  await t.test("connection is loopback-only and development fixtures authenticate structurally", async () => {
    const identity = await pool.query<{ address: string; port: number; database: string }>(
      "select inet_server_addr()::text as address,inet_server_port() as port,current_database() as database",
    );
    assert.ok(["127.0.0.1/32", "::1/128"].includes(identity.rows[0]!.address));
    assert.equal(identity.rows[0]!.port, Number(databaseUrl.port || 5432));
    assert.equal(identity.rows[0]!.database, databaseUrl.pathname.slice(1));
    fixtures = await loadFixtures();
    const authRows = await pool.query<{ id: string; roles: string[] }>(`
      select u.id,array_agg(ur.role order by ur.role) roles from "user" u
      join user_role ur on ur.user_id=u.id
      join account a on a.user_id=u.id and a.provider_id='credential'
      where u.id=any($1::text[]) and a.password is not null
      group by u.id order by u.id
    `, [[GOD_ID, PLAYER_ID]]);
    assert.deepEqual(authRows.rows.map(({ id }) => id), [GOD_ID, PLAYER_ID]);
    for (const email of ["god.step13@local.test", "player.step13@local.test"]) {
      const signedIn = await auth.api.signInEmail({
        body: { email, password: "Step13-Local-Only!" },
      });
      assert.equal(signedIn.user.email, email);
    }
  });

  await t.test("Active Health persists localized/over Damage, healing semantics, Injury history, and Restore All", async () => {
    await clearActiveState([fixtures.playerCharacterId]);
    let poolKey = "";
    let damageAmount = 0;
    await db.transaction(async (tx) => {
      const context = await lockActiveHealthInTransaction(tx, fixtures.playerCharacterId, "race");
      const location = context.anatomy.hitLocations.find(({ poolKey: key }) => Boolean(key));
      assert.ok(location?.poolKey);
      const poolAnatomy = context.anatomy.pools.find(({ key }) => key === location.poolKey);
      assert.ok(poolAnatomy?.maximumHp);
      poolKey = poolAnatomy.key;
      damageAmount = poolAnatomy.maximumHp + 5;
      const target = resolveLocalizedDamageTarget(context.anatomy, { amount: damageAmount, hitLocationNumber: location.result });
      const next = applyLocalizedDamage(context.state, context.anatomy, { amount: damageAmount, hitLocationNumber: location.result });
      await persistActiveHealthStateInTransaction(tx, context.anatomy, next);
      await tx.insert(campaignCharacterInjury).values({
        characterId: fixtures.playerCharacterId,
        poolKey: target.poolKey,
        poolNameSnapshot: target.poolName,
        hitLocationNumber: target.hitLocationNumber,
        hitLocationNameSnapshot: target.hitLocationName,
        name: "Step 13 over-damage injury",
        notes: "Persists independently of healing.",
        damageAmount: target.amount,
      });
    });
    let health = await persistedHealth(fixtures.playerCharacterId);
    assert.equal(health.view.totalDamage, damageAmount);
    assert.equal(health.view.tracks.find(({ key }) => key === poolKey)?.damage, damageAmount);
    assert.equal(health.view.tracks.find(({ key }) => key === poolKey)?.overDamage, 5);
    assert.ok(health.state.injuries[0]?.hitLocationNumber !== null);

    await db.transaction(async (tx) => {
      const current = await lockActiveHealthInTransaction(tx, fixtures.playerCharacterId, "race");
      const area = applyAreaHealing(current.state, current.anatomy, poolKey, 2);
      await persistActiveHealthStateInTransaction(tx, current.anatomy, area);
    });
    health = await persistedHealth(fixtures.playerCharacterId);
    assert.equal(health.view.totalDamage, damageAmount, "Area Healing must not alter Total Damage.");
    assert.equal(health.view.tracks.find(({ key }) => key === poolKey)?.damage, damageAmount - 2);
    assert.equal(health.state.injuries[0]?.resolved, false, "Healing must not resolve Injuries.");

    await db.transaction(async (tx) => {
      const current = await lockActiveHealthInTransaction(tx, fixtures.playerCharacterId, "race");
      await persistActiveHealthStateInTransaction(tx, current.anatomy, applyFullBodyHealing(current.state, 3));
    });
    health = await persistedHealth(fixtures.playerCharacterId);
    assert.equal(health.view.totalDamage, damageAmount - 3);
    assert.equal(health.view.tracks.find(({ key }) => key === poolKey)?.damage, damageAmount - 5);

    await db.transaction(async (tx) => {
      const current = await lockActiveHealthInTransaction(tx, fixtures.playerCharacterId, "race");
      const restoredAt = new Date();
      const restored = restoreAllHealth(current.state, restoredAt);
      await persistActiveHealthStateInTransaction(tx, current.anatomy, restored);
      await tx.update(campaignCharacterInjury).set({ resolved: true, resolvedAt: restoredAt, updatedAt: restoredAt })
        .where(and(eq(campaignCharacterInjury.characterId, fixtures.playerCharacterId), eq(campaignCharacterInjury.resolved, false)));
    });
    health = await persistedHealth(fixtures.playerCharacterId);
    assert.equal(health.view.totalDamage, 0);
    assert.equal(health.view.tracks.find(({ key }) => key === poolKey)?.damage, 0);
    assert.equal(health.state.injuries.length, 1);
    assert.equal(health.state.injuries[0]!.resolved, true);
  });

  await t.test("Creature Active Health uses calculated current-snapshot Total and Pool HP", async () => {
    await clearActiveState([fixtures.creatureNpcId]);
    await db.transaction(async (tx) => {
      const context = await lockActiveHealthInTransaction(tx, fixtures.creatureNpcId, "creature");
      assert.equal(context.anatomy.kind, "creature");
      assert.equal(context.anatomy.totalMaximumHp, 50);
      assert.equal(context.anatomy.maximumHpNote, null);
      assert.deepEqual(context.anatomy.pools.map(({ name }) => name), ["Body", "Tail"]);
      assert.deepEqual(context.anatomy.pools.map(({ maximumHp }) => maximumHp), [40, 10]);
      const next = applyLocalizedDamage(context.state, context.anatomy, { amount: 4, hitLocationNumber: 9 });
      await persistActiveHealthStateInTransaction(tx, context.anatomy, next);
    });
    const health = await persistedHealth(fixtures.creatureNpcId, "creature");
    assert.equal(health.state.totalDamage, 4);
    assert.equal(health.state.pools.find(({ poolKey }) => poolKey === "DEV-STEP13-TAIL")?.damage, 4);
  });

  await t.test("Active Mana creates missing rows, keeps systems independent, derives Current, and preserves spent Mana through advancement", async () => {
    await clearActiveState([fixtures.playerCharacterId]);
    let view = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    const initialSpellcraft = view.pools.find(({ system }) => system === "Spellcraft");
    const initialFaith = view.pools.find(({ system }) => system === "Faith");
    assert.ok(initialSpellcraft && initialFaith);
    assert.equal(initialSpellcraft.manaSpent, 0);
    assert.equal(initialFaith.manaSpent, 0);

    await db.transaction(async (tx) => {
      await spendActiveManaInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft", amount: 4 });
      await spendActiveManaInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Faith", amount: 2 });
      await restoreActiveManaInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft", amount: 1 });
    });
    view = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(view.pools.find(({ system }) => system === "Spellcraft")?.manaSpent, 3);
    assert.equal(view.pools.find(({ system }) => system === "Faith")?.manaSpent, 2);
    assert.equal(view.pools.find(({ system }) => system === "Spellcraft")?.currentMana, initialSpellcraft.maximumMana - 3);

    await db.transaction(async (tx) => {
      await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 1 })
        .where(eq(campaignCharacterProfile.characterId, fixtures.playerCharacterId));
    });
    const advanced = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(advanced.pools.find(({ system }) => system === "Spellcraft")?.manaSpent, 3);
    assert.equal(
      advanced.pools.find(({ system }) => system === "Spellcraft")?.currentMana,
      (advanced.pools.find(({ system }) => system === "Spellcraft")?.maximumMana ?? 0) - 3,
    );
    await db.transaction(async (tx) => {
      await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 0 })
        .where(eq(campaignCharacterProfile.characterId, fixtures.playerCharacterId));
      await restoreActiveManaPoolInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft" });
    });
    view = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(view.pools.find(({ system }) => system === "Spellcraft")?.manaSpent, 0);
    assert.equal(view.pools.find(({ system }) => system === "Faith")?.manaSpent, 2);
  });

  await t.test("real PostgreSQL Mana row locking prevents simultaneous overspend", async () => {
    await pool.query("delete from campaign_character_active_mana where character_id=$1 and system='Spellcraft'", [fixtures.playerCharacterId]);
    const initial = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    const maximum = initial.pools.find(({ system }) => system === "Spellcraft")!.maximumMana;
    assert.ok(maximum >= 10);
    await db.transaction((tx) => spendActiveManaInTransaction(tx, {
      characterId: fixtures.playerCharacterId,
      system: "Spellcraft",
      amount: maximum - 10,
    }));
    const results = await Promise.allSettled([1, 2].map(() => db.transaction((tx) => spendActiveManaInTransaction(tx, {
      characterId: fixtures.playerCharacterId,
      system: "Spellcraft",
      amount: 7,
    }))));
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
    const final = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(final.pools.find(({ system }) => system === "Spellcraft")?.currentMana, 3);
  });

  await t.test("stack and instance ownership preserve identity, Charges, Equipment State, price, and acquisition metadata", async () => {
    const stacks = await pool.query<{ quantity: number; unit_cost_credits: number; acquired_at: Date }>(`
      select quantity,unit_cost_credits,acquired_at from campaign_character_item cci
      join items i on i.id=cci.item_id
      where cci.character_id=$1 and i.canonical_id='DEV-STEP13-STACK'
    `, [fixtures.playerCharacterId]);
    assert.equal(stacks.rows[0]?.quantity, 3);
    assert.equal(stacks.rows[0]?.unit_cost_credits, 12.5);
    assert.ok(stacks.rows[0]?.acquired_at);
    const instances = await pool.query<{ id: number; current_charges: number; equipment_state: string; unit_cost_credits: number; acquired_at: Date }>(`
      select id,current_charges,equipment_state,unit_cost_credits,acquired_at
      from campaign_character_item_instance where character_id=$1 and item_id=$2 order by id
    `, [fixtures.playerCharacterId, fixtures.chargedItemId]);
    assert.deepEqual(instances.rows.map(({ id }) => id), fixtures.chargedInstanceIds);
    assert.deepEqual(instances.rows.map(({ equipment_state }) => equipment_state), ["wielded", "inactive"]);
    assert.deepEqual(instances.rows.map(({ unit_cost_credits }) => unit_cost_credits), [20, 18]);
    assert.ok(instances.rows.every(({ acquired_at }) => acquired_at));
    await pool.query("update campaign_character set updated_at=updated_at where id=$1", [fixtures.playerCharacterId]);
    const stable = await pool.query<{ id: number }>("select id from campaign_character_item_instance where character_id=$1 order by id", [fixtures.playerCharacterId]);
    assert.deepEqual(stable.rows.map(({ id }) => id), fixtures.chargedInstanceIds);
  });

  await t.test("Equipment State exposes armor/weapon context and concurrent passive reconciliation does not duplicate state", async () => {
    await pool.query("delete from campaign_character_active_condition where character_id=$1", [fixtures.playerCharacterId]);
    await pool.query("delete from campaign_character_active_modifier where character_id=$1", [fixtures.playerCharacterId]);
    const results = await Promise.allSettled([1, 2].map(() => db.transaction((tx) => reconcileItemPassiveEffectsInTransaction(
      tx,
      fixtures.playerCharacterId,
      [fixtures.armorItemId],
    ))));
    assert.deepEqual(results.map((result) => result.status === "fulfilled" ? "fulfilled" : String(result.reason)), ["fulfilled", "fulfilled"]);
    const view = await db.transaction((tx) => readCharacterEquipmentStateInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(view.stacks.find(({ itemId }) => itemId === fixtures.armorItemId)?.wornQuantity, 1);
    assert.equal(view.wornArmor.some(({ itemId, itemName }) => itemId === fixtures.armorItemId && itemNameMatches("Ward Armor", itemName)), true);
    assert.equal(view.wieldedWeapons.some(({ itemId }) => itemId === fixtures.chargedItemId), true);
    const effects = await db.transaction((tx) => readActiveEffectsInTransaction(tx, fixtures.playerCharacterId, true));
    assert.equal(effects.conditions.filter(({ name, resolvedAt }) => name === "Ward Armor Active" && !resolvedAt).length, 1);
    assert.equal(effects.modifiers.filter(({ label, endedAt }) => label === "Ward Armor Soak" && !endedAt).length, 1);

    await pool.query("delete from campaign_character_item_equipment_state where character_id=$1 and item_id=$2", [fixtures.playerCharacterId, fixtures.armorItemId]);
    await db.transaction((tx) => reconcileItemPassiveEffectsInTransaction(tx, fixtures.playerCharacterId, [fixtures.armorItemId]));
    const ended = await db.transaction((tx) => readActiveEffectsInTransaction(tx, fixtures.playerCharacterId, true));
    assert.ok(ended.conditions.some(({ name, resolvedAt }) => name === "Ward Armor Active" && resolvedAt));
    assert.ok(ended.modifiers.some(({ label, endedAt }) => label === "Ward Armor Soak" && endedAt));
    await pool.query(`insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity)
      values ($1,$2,'worn',1) on conflict (character_id,item_id,state) do update set quantity=excluded.quantity`, [fixtures.playerCharacterId, fixtures.armorItemId]);
  });

  await t.test("Charge management persists every mutation, notes, zero/maximum bounds, and Equipment State", async () => {
    const instanceId = fixtures.chargedInstanceIds[0]!;
    let state = await setCharges(instanceId, 5);
    assert.equal(state.currentCharges, 5);
    assert.equal(state.equipmentState, "wielded");
    assert.match(state.rechargeNotes, /Restore manually/);
    state = await db.transaction((tx) => spendItemChargesInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }));
    assert.equal(state.currentCharges, 4);
    state = await db.transaction((tx) => restoreItemChargesInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId, amount: 1,
    }));
    assert.equal(state.currentCharges, 5);
    await assert.rejects(setCharges(instanceId, 6), /cannot exceed|between/i);
    state = await setCharges(instanceId, 0);
    assert.equal(state.currentCharges, 0);
    state = await db.transaction((tx) => restoreItemChargesFullInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }));
    assert.equal(state.currentCharges, 5);
    assert.equal(state.equipmentState, "wielded");
  });

  await t.test("real Charge locking prevents double use and prevents lost spend-vs-recharge updates", async () => {
    const instanceId = fixtures.chargedInstanceIds[1]!;
    await setCharges(instanceId, 1);
    const spends = await Promise.allSettled([1, 2].map(() => db.transaction((tx) => spendItemChargesInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }))));
    assert.equal(spends.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(spends.filter(({ status }) => status === "rejected").length, 1);
    assert.equal((await db.transaction((tx) => readItemChargeStateInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }))).currentCharges, 0);

    await setCharges(instanceId, 2);
    const race = await Promise.all([
      db.transaction((tx) => spendItemChargesInTransaction(tx, {
        characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
      })),
      db.transaction((tx) => restoreItemChargesInTransaction(tx, {
        characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId, amount: 2,
      })),
    ]);
    assert.equal(race.length, 2);
    assert.equal((await db.transaction((tx) => readItemChargeStateInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }))).currentCharges, 3);
  });

  await t.test("Item Use exercises none, consume-item, charges, unlimited, automatic, Manual, mixed, and exact-instance paths", async () => {
    await clearActiveState([fixtures.playerCharacterId]);
    const ordinary = await loadItemDefinition("DEV-STEP13-STACK");
    const ordinaryHealth = await persistedHealth(fixtures.playerCharacterId);
    const ordinaryPlan = planItemUse({
      definition: ordinary,
      resource: { kind: "stack", quantity: 3 },
      requestedItemInstanceId: null,
      target: {
        characterId: fixtures.playerCharacterId,
        name: "Mara Tidewright",
        anatomy: ordinaryHealth.anatomy,
        state: ordinaryHealth.state,
      },
    });
    assert.equal(ordinaryPlan.status, "not-executable");

    const beforeConsume = await pool.query<{ quantity: number }>("select quantity from campaign_character_item where character_id=$1 and item_id=(select id from items where canonical_id='DEV-STEP13-HEAL')", [fixtures.playerCharacterId]);
    const consumed = await useFixtureItem({ canonicalId: "DEV-STEP13-HEAL" });
    assert.equal(consumed.resource.kind, "stack");
    const afterConsume = await pool.query<{ quantity: number }>("select quantity from campaign_character_item where character_id=$1 and item_id=(select id from items where canonical_id='DEV-STEP13-HEAL')", [fixtures.playerCharacterId]);
    assert.equal(afterConsume.rows[0]!.quantity, beforeConsume.rows[0]!.quantity - 1);

    const health = await persistedHealth(fixtures.playerCharacterId);
    const location = health.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
    await setCharges(fixtures.chargedInstanceIds[0]!, 5);
    const charged = await useFixtureItem({
      canonicalId: "DEV-STEP13-CHARGED",
      instanceId: fixtures.chargedInstanceIds[0],
      hitLocationNumber: location.result,
    });
    assert.equal(charged.resource.kind, "instance");
    assert.equal((await db.transaction((tx) => readItemChargeStateInTransaction(tx, {
      characterId: fixtures.playerCharacterId,
      itemId: fixtures.chargedItemId,
      instanceId: fixtures.chargedInstanceIds[0]!,
    }))).currentCharges, 4);

    const areaPool = (await persistedHealth(fixtures.playerCharacterId)).anatomy.pools[0]!.key;
    const mixed = await useFixtureItem({ canonicalId: "DEV-STEP13-MIXED", poolKey: areaPool });
    assert.equal(mixed.resource.kind, "stack");
    assert.equal(mixed.automaticEffects.length, 1);
    assert.equal(mixed.manualEffects.length, 1);
    const manual = await useFixtureItem({ canonicalId: "DEV-STEP13-MANUAL" });
    assert.equal(manual.automaticEffects.length, 0);
    assert.equal(manual.manualEffects.length, 1);
  });

  await t.test("Item Use rejects cross-Campaign authority and rolls resource/health back together", async () => {
    const subject = { userId: PLAYER_ID, roles: ["player"] };
    const source = { characterId: fixtures.playerCharacterId, campaignId: fixtures.campaignId, playerUserId: PLAYER_ID, campaignOwnerUserId: GOD_ID, isNpc: false, isCampaignMember: true };
    const { canExecuteItemUse } = await import("@/features/items/item-use");
    assert.equal(canExecuteItemUse(subject, source, { ...source, characterId: 999999, campaignId: fixtures.campaignId + 1 }), false);

    const instanceId = fixtures.chargedInstanceIds[0]!;
    await setCharges(instanceId, 5);
    const beforeHealth = (await persistedHealth(fixtures.playerCharacterId)).state.totalDamage;
    const beforeCharge = (await db.transaction((tx) => readItemChargeStateInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }))).currentCharges;
    await assert.rejects(db.transaction(async (tx) => {
      await spendItemChargesInTransaction(tx, { characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId });
      const health = await lockActiveHealthInTransaction(tx, fixtures.playerCharacterId, "race");
      const location = health.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
      const next = applyLocalizedDamage(health.state, health.anatomy, { amount: 3, hitLocationNumber: location.result });
      await persistActiveHealthStateInTransaction(tx, health.anatomy, next);
      throw new Error("Step 13 simulated Item Use persistence failure");
    }), /simulated Item Use/);
    assert.equal((await persistedHealth(fixtures.playerCharacterId)).state.totalDamage, beforeHealth);
    assert.equal((await db.transaction((tx) => readItemChargeStateInTransaction(tx, {
      characterId: fixtures.playerCharacterId, itemId: fixtures.chargedItemId, instanceId,
    }))).currentCharges, beforeCharge);
  });

  await t.test("Conditions and Modifiers persist snapshots, aggregate, retain history, and never auto-expire", async () => {
    await pool.query("delete from campaign_character_active_condition where character_id=$1", [fixtures.playerCharacterId]);
    await pool.query("delete from campaign_character_active_modifier where character_id=$1", [fixtures.playerCharacterId]);
    await db.transaction(async (tx) => {
      const source = { kind: "god" as const, id: GOD_ID, name: "Step 13 G.O.D." };
      const condition = await applyConditionInTransaction(tx, {
        characterId: fixtures.playerCharacterId,
        source,
        sourceEffectKey: "condition-check",
        effect: { kind: "condition.apply", name: "Observed", description: "Persisted test Condition.", duration: { kind: "scene", value: null } },
      });
      const first = await applyModifierInTransaction(tx, {
        characterId: fixtures.playerCharacterId,
        source,
        sourceEffectKey: "modifier-one",
        effect: { kind: "modifier.apply", label: "First Initiative", channel: "initiative", targetKey: "self", amount: 2, duration: { kind: "combat-rounds", value: 2 } },
      });
      await applyModifierInTransaction(tx, {
        characterId: fixtures.playerCharacterId,
        source,
        sourceEffectKey: "modifier-two",
        effect: { kind: "modifier.apply", label: "Second Initiative", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "until-removed", value: null } },
      });
      assert.equal(await getActiveModifierTotalInTransaction(tx, fixtures.playerCharacterId, "initiative", "self"), 1);
      const active = await readActiveEffectsInTransaction(tx, fixtures.playerCharacterId);
      assert.equal(active.conditions[0]!.source.effectKey, "condition-check");
      assert.equal(active.conditions[0]!.duration.kind, "scene");
      assert.equal(active.modifiers.length, 2);
      await resolveConditionInTransaction(tx, fixtures.playerCharacterId, condition.id, "Reviewed");
      await endModifierInTransaction(tx, fixtures.playerCharacterId, first.id, "Reviewed");
    });
    const history = await db.transaction((tx) => readActiveEffectsInTransaction(tx, fixtures.playerCharacterId, true));
    assert.ok(history.conditions[0]?.resolvedAt);
    assert.equal(history.conditions[0]?.resolutionNote, "Reviewed");
    assert.ok(history.modifiers.some(({ endNote }) => endNote === "Reviewed"));
    assert.equal(history.modifiers.filter(({ endedAt }) => !endedAt).length, 1, "No duration is automatically expired.");
  });

  await t.test("saved Spell documents are schema v7, legacy-compatible, and plan from actual caster/Mana context", async () => {
    const rows = await pool.query<{ document_json: string }>("select document_json from campaign_character_spell_document where character_id=$1 order by id", [fixtures.playerCharacterId]);
    assert.equal(rows.rows.length, 6);
    for (const row of rows.rows) assert.equal(parseSpellDocument(JSON.parse(row.document_json)).schemaVersion, 7);
    const legacy = JSON.parse(rows.rows[0]!.document_json) as Record<string, unknown>;
    legacy.schemaVersion = 6;
    assert.equal(parseSpellDocument(legacy).schemaVersion, 7);
    await pool.query("delete from campaign_character_active_mana where character_id=$1 and system='Spellcraft'", [fixtures.playerCharacterId]);
    const plan = await loadSpellPlan("step13-damage", fixtures.raceNpcId, { hitLocationNumber: 0 });
    assert.equal(plan.status, "ready");
    assert.equal(plan.castingCircumstance, "have-spell");
    assert.equal(plan.caster.system, "Spellcraft");
    assert.ok(plan.finalManaCost > 0);
    assert.equal(plan.manaAfterCast, plan.currentMana - plan.finalManaCost);
    const aoePlan = await loadSpellPlan("step13-aoe-damage", fixtures.raceNpcId, { hitLocationNumber: 0 });
    assert.equal(aoePlan.status, "ready");
    assert.equal(aoePlan.targetGroups[0]?.kind, "aoe");
    assert.deepEqual(aoePlan.targetGroups[0]?.selectedTargetIds, [fixtures.raceNpcId]);
    assert.equal(aoePlan.targetGroups[0]?.capacity, null);
  });

  await t.test("real Spell casting spends authoritative Mana and applies Damage, Healing, Manual-only, and mixed consequences", async () => {
    await clearActiveState([fixtures.playerCharacterId, fixtures.raceNpcId]);
    const targetHealth = await persistedHealth(fixtures.raceNpcId);
    const location = targetHealth.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
    const damage = await executeSavedSpell("step13-damage", fixtures.raceNpcId, { hitLocationNumber: location.result });
    assert.equal(damage.automaticEffects.length, 1);
    assert.equal((await persistedHealth(fixtures.raceNpcId)).state.totalDamage, 2);
    assert.equal(damage.finalMana.manaSpent, damage.finalManaCost);

    await db.transaction((tx) => restoreActiveManaPoolInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft" }));
    const full = await executeSavedSpell("step13-full-heal", fixtures.raceNpcId);
    assert.equal(full.automaticEffects.length, 1);
    assert.equal((await persistedHealth(fixtures.raceNpcId)).state.totalDamage, 0);
    assert.equal(full.finalMana.manaSpent, full.finalManaCost);

    await db.transaction(async (tx) => {
      const health = await lockActiveHealthInTransaction(tx, fixtures.raceNpcId, "race");
      const next = applyLocalizedDamage(health.state, health.anatomy, { amount: 4, hitLocationNumber: location.result });
      await persistActiveHealthStateInTransaction(tx, health.anatomy, next);
    });
    const poolKey = location.poolKey!;
    const beforeArea = await persistedHealth(fixtures.raceNpcId);
    await db.transaction((tx) => restoreActiveManaPoolInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft" }));
    const area = await executeSavedSpell("step13-area-heal", fixtures.raceNpcId, { poolKey });
    assert.equal(area.automaticEffects.length, 1);
    const afterArea = await persistedHealth(fixtures.raceNpcId);
    assert.equal(afterArea.state.totalDamage, beforeArea.state.totalDamage);
    assert.equal(afterArea.state.pools.find((entry) => entry.poolKey === poolKey)!.damage, beforeArea.state.pools.find((entry) => entry.poolKey === poolKey)!.damage - 2);

    await db.transaction((tx) => restoreActiveManaPoolInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft" }));
    const manual = await executeSavedSpell("step13-manual", fixtures.raceNpcId);
    assert.equal(manual.automaticEffects.length, 0);
    assert.equal(manual.manualEffects.length, 1);
    await db.transaction((tx) => restoreActiveManaPoolInTransaction(tx, { characterId: fixtures.playerCharacterId, system: "Spellcraft" }));
    const mixed = await executeSavedSpell("step13-mixed", fixtures.raceNpcId, { hitLocationNumber: location.result });
    assert.equal(mixed.automaticEffects.length, 1);
    assert.equal(mixed.manualEffects.length, 1);
  });

  await t.test("Spell transaction rollback restores both Mana and Active Health", async () => {
    await clearActiveState([fixtures.playerCharacterId, fixtures.raceNpcId]);
    const target = await persistedHealth(fixtures.raceNpcId);
    const location = target.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
    const beforeMana = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    await assert.rejects(executeSavedSpell("step13-damage", fixtures.raceNpcId, { hitLocationNumber: location.result }, true), /simulated Spell/);
    const afterMana = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(afterMana.pools.find(({ system }) => system === "Spellcraft")?.manaSpent, beforeMana.pools.find(({ system }) => system === "Spellcraft")?.manaSpent);
    assert.equal((await persistedHealth(fixtures.raceNpcId)).state.totalDamage, 0);
  });

  await t.test("competing real Spell Mana spends serialize without overspending", async () => {
    await clearActiveState([fixtures.playerCharacterId, fixtures.raceNpcId]);
    const target = await persistedHealth(fixtures.raceNpcId);
    const location = target.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
    const plan = await loadSpellPlan("step13-damage", fixtures.raceNpcId, { hitLocationNumber: location.result });
    const view = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    const maximum = view.pools.find(({ system }) => system === "Spellcraft")!.maximumMana;
    assert.ok(plan.finalManaCost > 0 && maximum >= plan.finalManaCost);
    const remaining = plan.finalManaCost;
    if (maximum > remaining) {
      await db.transaction((tx) => spendActiveManaInTransaction(tx, {
        characterId: fixtures.playerCharacterId,
        system: "Spellcraft",
        amount: maximum - remaining,
      }));
    }
    const results = await Promise.allSettled([1, 2].map(() => executeSavedSpell(
      "step13-damage",
      fixtures.raceNpcId,
      { hitLocationNumber: location.result },
    )));
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
    const final = await db.transaction((tx) => readActiveManaInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(final.pools.find(({ system }) => system === "Spellcraft")?.currentMana, 0);
    assert.equal((await persistedHealth(fixtures.raceNpcId)).state.totalDamage, 2);
  });

  await t.test("persisted Player/G.O.D. Spell authorization honors caster, target, NPC, and cross-Campaign boundaries", async () => {
    const source = { characterId: fixtures.playerCharacterId, campaignId: fixtures.campaignId, playerUserId: PLAYER_ID, campaignOwnerUserId: GOD_ID, isNpc: false, npcKind: "race" as const, isCampaignMember: true };
    const raceNpc = { ...source, characterId: fixtures.raceNpcId, playerUserId: GOD_ID, isNpc: true };
    const creatureNpc = { ...raceNpc, characterId: fixtures.creatureNpcId, npcKind: "creature" as const };
    const player = { userId: PLAYER_ID, roles: ["player"] };
    const god = { userId: GOD_ID, roles: ["god"] };
    assert.equal(canInitiateSpellCast(player, source), true);
    assert.equal(canInitiateSpellCast(player, raceNpc), false);
    assert.equal(canInitiateSpellCast(god, raceNpc), true);
    assert.equal(canInitiateSpellCast(god, creatureNpc), false);
    assert.equal(canTargetSpellCast(player, source, source), true);
    assert.equal(canTargetSpellCast(player, source, raceNpc), false);
    assert.equal(canTargetSpellCast(god, source, creatureNpc), true);
    assert.equal(canTargetSpellCast(god, source, { ...raceNpc, campaignId: fixtures.campaignId + 1 }), false);
  });

  await t.test("Creature Ability snapshots preserve master isolation, structured order, legacy Manual fallback, and current-snapshot runtime", async () => {
    await clearActiveState([fixtures.playerCharacterId]);
    const snapshotRows = await pool.query<{ baseline_snapshot_json: string; current_snapshot_json: string }>("select baseline_snapshot_json,current_snapshot_json from campaign_creature_npc_profile where character_id=$1", [fixtures.creatureNpcId]);
    assert.equal(snapshotRows.rows[0]!.baseline_snapshot_json, snapshotRows.rows[0]!.current_snapshot_json);
    const current = JSON.parse(snapshotRows.rows[0]!.current_snapshot_json) as { abilities: unknown[] };
    const structured = normalizeCreatureAbilityDefinition(current.abilities[0]);
    const legacy = normalizeCreatureAbilityDefinition(current.abilities[1]);
    assert.deepEqual(structured.effects.map(({ effectKey }) => effectKey), ["slam-damage", "slam-condition"]);
    const targetHealth = await persistedHealth(fixtures.playerCharacterId);
    const location = targetHealth.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
    const plan = planCreatureAbilityUse({
      sourceCreature: { characterId: fixtures.creatureNpcId, name: "Brine, the Review Beast" },
      ability: structured,
      fingerprint: "local-current-snapshot",
      targets: [{ characterId: fixtures.playerCharacterId, name: "Mara Tidewright", isNpc: false, npcKind: "race", anatomy: targetHealth.anatomy, state: targetHealth.state }],
      targetCharacterIds: [fixtures.playerCharacterId],
      effectSelections: { [creatureAbilityApplicationKey("slam-damage", fixtures.playerCharacterId)]: { hitLocationNumber: location.result } },
    });
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.automaticApplications.map(({ effectKey }) => effectKey), ["slam-damage", "slam-condition"]);
    const legacyPlan = planCreatureAbilityUse({
      sourceCreature: { characterId: fixtures.creatureNpcId, name: "Brine, the Review Beast" },
      ability: legacy,
      fingerprint: "local-current-snapshot",
      targets: [],
      targetCharacterIds: [],
    });
    assert.equal(legacyPlan.status, "ready");
    assert.equal(legacyPlan.manualEffects[0]?.compatibilityFallback, true);

    const masterBefore = await pool.query<{ effect_json: unknown }>("select effect_json from creature_ability_effects cae join creature_abilities ca on ca.id=cae.ability_id where ca.canonical_id='DEV-STEP13-STRUCTURED-ABILITY' and cae.effect_key='slam-damage'");
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`update creature_ability_effects set effect_json=${JSON.stringify({ kind: "health.damage", amount: 99, application: "localized" })}::jsonb where effect_key='slam-damage' and ability_id=(select id from creature_abilities where canonical_id='DEV-STEP13-STRUCTURED-ABILITY')`);
      const unchanged = await tx.execute(sql<{ current_snapshot_json: string }>`select current_snapshot_json from campaign_creature_npc_profile where character_id=${fixtures.creatureNpcId}`);
      assert.equal((unchanged.rows[0] as { current_snapshot_json: string }).current_snapshot_json, snapshotRows.rows[0]!.current_snapshot_json);
      throw new Error("rollback master isolation probe");
    }), /rollback master isolation/);
    const masterAfter = await pool.query<{ effect_json: unknown }>("select effect_json from creature_ability_effects cae join creature_abilities ca on ca.id=cae.ability_id where ca.canonical_id='DEV-STEP13-STRUCTURED-ABILITY' and cae.effect_key='slam-damage'");
    assert.deepEqual(masterAfter.rows[0]!.effect_json, masterBefore.rows[0]!.effect_json);

    const editedCurrent = structuredClone(current) as { abilities: Array<Record<string, unknown>> };
    editedCurrent.abilities[0]!.description = "Individual NPC-only current Ability edit.";
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`update campaign_creature_npc_profile set current_snapshot_json=${JSON.stringify(editedCurrent)} where character_id=${fixtures.creatureNpcId}`);
      const isolated = await tx.execute(sql<{ baseline_snapshot_json: string; current_snapshot_json: string }>`
        select baseline_snapshot_json,current_snapshot_json from campaign_creature_npc_profile where character_id=${fixtures.creatureNpcId}
      `);
      const row = isolated.rows[0] as { baseline_snapshot_json: string; current_snapshot_json: string };
      assert.equal(row.baseline_snapshot_json, snapshotRows.rows[0]!.baseline_snapshot_json);
      assert.notEqual(row.current_snapshot_json, row.baseline_snapshot_json);
      const master = await tx.execute(sql<{ description: string }>`select description from creature_abilities where canonical_id='DEV-STEP13-STRUCTURED-ABILITY'`);
      assert.equal((master.rows[0] as { description: string }).description, "A structured local test Ability.");
      throw new Error("rollback current snapshot isolation probe");
    }), /rollback current snapshot isolation/);
  });

  await t.test("Creature Ability execution persists ordered Active State and rolls every effect back on later failure", async () => {
    await clearActiveState([fixtures.playerCharacterId]);
    const loadPlanInTransaction = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      const snapshotResult = await tx.execute(sql<{ current_snapshot_json: string }>`select current_snapshot_json from campaign_creature_npc_profile where character_id=${fixtures.creatureNpcId}`);
      const snapshot = JSON.parse((snapshotResult.rows[0] as { current_snapshot_json: string }).current_snapshot_json) as { abilities: unknown[] };
      const ability = normalizeCreatureAbilityDefinition(snapshot.abilities[0]);
      const target = await lockActiveHealthInTransaction(tx, fixtures.playerCharacterId, "race");
      const location = target.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
      return {
        anatomy: target.anatomy,
        plan: planCreatureAbilityUse({
          sourceCreature: { characterId: fixtures.creatureNpcId, name: "Brine, the Review Beast" },
          ability,
          fingerprint: "authoritative-current-snapshot",
          targets: [{ characterId: fixtures.playerCharacterId, name: "Mara Tidewright", isNpc: false, npcKind: "race", anatomy: target.anatomy, state: target.state }],
          targetCharacterIds: [fixtures.playerCharacterId],
          effectSelections: { [creatureAbilityApplicationKey("slam-damage", fixtures.playerCharacterId)]: { hitLocationNumber: location.result } },
        }),
      };
    };
    let anatomy: Awaited<ReturnType<typeof loadPlanInTransaction>>["anatomy"] | null = null;
    const result = await executeCreatureAbilityUseInTransaction((execute) => db.transaction(async (tx) => execute({
      loadAndPlan: async () => {
        const loaded = await loadPlanInTransaction(tx);
        anatomy = loaded.anatomy;
        return loaded.plan;
      },
      applyAutomaticEffect: async (application) => {
        assert.ok(anatomy);
        await persistPlannedMechanicalEffectInTransaction(tx, {
          plan: application.plan,
          targetCharacterId: application.targetCharacterId,
          sourceEffectKey: application.effectKey,
          targetAnatomy: anatomy,
        });
      },
    })), true);
    assert.deepEqual(result.automaticEffects.map(({ effectKey }) => effectKey), ["slam-damage", "slam-condition"]);
    assert.equal((await persistedHealth(fixtures.playerCharacterId)).state.totalDamage, 2);
    assert.ok((await db.transaction((tx) => readActiveEffectsInTransaction(tx, fixtures.playerCharacterId))).conditions.some(({ name }) => name === "Drenched"));

    await clearActiveState([fixtures.playerCharacterId]);
    anatomy = null;
    await assert.rejects(executeCreatureAbilityUseInTransaction((execute) => db.transaction(async (tx) => execute({
      loadAndPlan: async () => {
        const loaded = await loadPlanInTransaction(tx);
        anatomy = loaded.anatomy;
        return loaded.plan;
      },
      applyAutomaticEffect: async (application) => {
        assert.ok(anatomy);
        await persistPlannedMechanicalEffectInTransaction(tx, {
          plan: application.plan,
          targetCharacterId: application.targetCharacterId,
          sourceEffectKey: application.effectKey,
          targetAnatomy: anatomy,
        });
        if (application.effectKey === "slam-condition") throw new Error("Step 13 simulated Ability persistence failure");
      },
    })), true), /simulated Ability/);
    assert.equal((await persistedHealth(fixtures.playerCharacterId)).state.totalDamage, 0);
    assert.equal((await db.transaction((tx) => readActiveEffectsInTransaction(tx, fixtures.playerCharacterId))).conditions.length, 0);
  });

  await t.test("final fixture invariants retain stable ownership and permanent definitions", async () => {
    const charges = await db.transaction((tx) => readCharacterItemChargeStateInTransaction(tx, fixtures.playerCharacterId));
    assert.equal(charges.instances.length, 2);
    const permanent = await pool.query<{ effects: number; passives: number; abilities: number }>(`
      select
        (select count(*)::int from item_effects where item_id in (select id from items where source_system='step13-local')) effects,
        (select count(*)::int from item_passive_effects where item_id in (select id from items where source_system='step13-local')) passives,
        (select count(*)::int from creature_ability_effects cae join creature_abilities ca on ca.id=cae.ability_id join creatures c on c.id=ca.creature_id where c.source_system='step13-local') abilities
    `);
    assert.equal(permanent.rows[0]!.effects, 5);
    assert.equal(permanent.rows[0]!.passives, 2);
    assert.equal(permanent.rows[0]!.abilities, 2);
  });
});

function itemNameMatches(expected: string, actual: string): boolean {
  return actual.includes(expected);
}
