import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";

import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { PoolClient } from "pg";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignAllowedSystem, campaignPlayer } from "@/db/campaign-schema";
import {
  characterDerivedAbilityUse,
  derivedAbility,
  derivedAbilityEffect,
} from "@/db/derived-ability-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveHealth,
  campaignCharacterActiveModifier,
} from "@/db/realm-schema";
import { encodeDerivedAbilityEffects } from "@/features/derived-abilities/derived-ability-effects";
import { reconcileCharacterDerivedAbilityPassivesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Derived Ability runtime DB validation.");
}
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Derived Ability runtime DB tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(
    `Refusing Derived Ability runtime DB tests against non-development database ${databaseUrl.pathname.slice(1)}.`,
  );
}

const migration = readFileSync(
  path.resolve(process.cwd(), "drizzle/0020_derived_ability_character_runtime.sql"),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
let savepointSequence = 0;

async function expectRejection(
  client: PoolClient,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  const savepoint = `derived_runtime_rejection_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected PostgreSQL to reject the invalid Derived Ability runtime mutation.");
  assert.match(caught instanceof Error ? caught.message : String(caught), expected);
}

after(async () => {
  await pool.end();
});

test("0020 enforces ownership history, reacquisition, runtime ledgers, delete rules, and Character cascades", { timeout: 30_000 }, async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ table_name: string | null }>(
      "select to_regclass('public.character_derived_ability')::text as table_name",
    );
    if (existing.rows[0]?.table_name === null) await client.query(migration);

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const godId = `derived-runtime-god-${suffix}`;
    const playerId = `derived-runtime-player-${suffix}`;
    await client.query(`
      insert into "user" (id, name, email, email_verified, created_at, updated_at, username, display_username)
      values
        ($1, 'Runtime G.O.D.', $2, true, now(), now(), $3, $3),
        ($4, 'Runtime Player', $5, true, now(), now(), $6, $6)
    `, [godId, `${godId}@example.test`, godId, playerId, `${playerId}@example.test`, playerId]);
    const campaignRow = await client.query<{ id: number }>(`
      insert into campaign (
        name, overview, attribute_points, skill_points, max_starting_skill,
        points_to_unlock_next_tier, max_points_in_skill, starting_credit_amount,
        currency_system, fate_point_method, assigned_fate_points, created_by_user_id
      )
      values ($1, '', 0, 0, 0, 0, 100, 0, 'Credits', 'Assigned', 0, $2)
      returning id
    `, [`Derived Runtime ${suffix}`, godId]);
    const campaignId = campaignRow.rows[0]!.id;
    await client.query(`
      insert into campaign_player (campaign_id, user_id, is_npc_controller)
      values ($1, $2, false)
    `, [campaignId, playerId]);
    const characterRow = await client.query<{ id: number }>(`
      insert into campaign_character (campaign_id, player_user_id, name)
      values ($1, $2, 'Runtime Character')
      returning id
    `, [campaignId, playerId]);
    const characterId = characterRow.rows[0]!.id;
    const abilityRow = await client.query<{ id: number }>(`
      insert into derived_ability (name, acquisition_type, activation_type)
      values ($1, 'learned', 'activated')
      returning id
    `, [`Runtime Ability ${suffix}`]);
    const abilityId = abilityRow.rows[0]!.id;

    const first = await client.query<{ id: number }>(`
      insert into character_derived_ability
        (character_id, derived_ability_id, acquisition_method, acquired_by_user_id, acquisition_notes)
      values ($1, $2, 'learned', $3, 'explicit acquisition')
      returning id
    `, [characterId, abilityId, playerId]);
    await expectRejection(client, () => client.query(`
      insert into character_derived_ability
        (character_id, derived_ability_id, acquisition_method)
      values ($1, $2, 'learned')
    `, [characterId, abilityId]), /character_derived_ability_active_uq/);

    await client.query(`
      update character_derived_ability
         set revoked_at=now(), revoked_by_user_id=$2, revocation_notes='story change'
       where id=$1
    `, [first.rows[0]!.id, godId]);
    const second = await client.query<{ id: number }>(`
      insert into character_derived_ability
        (character_id, derived_ability_id, acquisition_method, acquired_by_user_id, acquisition_notes)
      values ($1, $2, 'learned', $3, 'reacquired')
      returning id
    `, [characterId, abilityId, godId]);
    assert.notEqual(second.rows[0]!.id, first.rows[0]!.id);

    const useRow = await client.query<{ id: number }>(`
      insert into character_derived_ability_use
        (character_id, derived_ability_id, ownership_id, actor_user_id, event_key, effect_summary, manual_steps)
      values ($1, $2, $3, $4, 'successful-parry', 'Condition applied', 'G.O.D. resolves anatomy')
      returning id
    `, [characterId, abilityId, second.rows[0]!.id, playerId]);
    const rechargeRow = await client.query<{ id: number }>(`
      insert into character_derived_ability_recharge
        (character_id, derived_ability_id, actor_user_id, refresh_scope, refresh_key, notes)
      values ($1, $2, $3, 'event', 'dawn', 'event confirmed')
      returning id
    `, [characterId, abilityId, godId]);
    assert.ok(useRow.rows[0]!.id > 0);
    assert.ok(rechargeRow.rows[0]!.id > 0);

    await expectRejection(
      client,
      () => client.query("delete from derived_ability where id=$1", [abilityId]),
      /foreign key constraint/,
    );
    await expectRejection(client, () => client.query(`
      insert into character_derived_ability_use
        (character_id, derived_ability_id, session_id)
      values ($1, $2, 2147483647)
    `, [characterId, abilityId]), /foreign key constraint/);
    await expectRejection(client, () => client.query(`
      insert into character_derived_ability_recharge
        (character_id, derived_ability_id, refresh_scope, refresh_key)
      values ($1, $2, 'event', null)
    `, [characterId, abilityId]), /character_derived_ability_recharge_key_valid/);

    await client.query("delete from campaign_character where id=$1", [characterId]);
    const remaining = await client.query<{ ownerships: number; uses: number; recharges: number }>(`
      select
        (select count(*)::int from character_derived_ability where character_id=$1) as ownerships,
        (select count(*)::int from character_derived_ability_use where character_id=$1) as uses,
        (select count(*)::int from character_derived_ability_recharge where character_id=$1) as recharges
    `, [characterId]);
    assert.deepEqual(remaining.rows[0], { ownerships: 0, uses: 0, recharges: 0 });
    await client.query("delete from derived_ability where id=$1", [abilityId]);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
});

test("passive synchronization is idempotent, reversible, restorable, and never fires health effects or use history", { timeout: 30_000 }, async () => {
  await db.transaction(async (tx) => {
    const existing = await tx.execute<{ table_name: string | null }>(
      sql`select to_regclass('public.character_derived_ability')::text as table_name`,
    );
    if (existing.rows[0]?.table_name === null) {
      await tx.execute(sql.raw(migration));
    }

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const godId = `derived-passive-god-${suffix}`;
    const playerId = `derived-passive-player-${suffix}`;
    await tx.insert(user).values([
      { id: godId, name: "Passive G.O.D.", email: `${godId}@example.test`, username: godId, displayUsername: godId },
      { id: playerId, name: "Passive Player", email: `${playerId}@example.test`, username: playerId, displayUsername: playerId },
    ]);
    const [campaignRow] = await tx.insert(campaign).values({
      name: `Derived Passive ${suffix}`,
      overview: "",
      attributePoints: 0,
      skillPoints: 0,
      maxStartingSkill: 0,
      pointsToUnlockNextTier: 0,
      maxPointsInSkill: 100,
      startingCreditAmount: 0,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 0,
      createdByUserId: godId,
    }).returning({ id: campaign.id });
    assert.ok(campaignRow);
    await tx.insert(campaignPlayer).values({
      campaignId: campaignRow.id,
      userId: playerId,
      isNpcController: false,
    });
    const [characterRow] = await tx.insert(campaignCharacter).values({
      campaignId: campaignRow.id,
      playerUserId: playerId,
      name: "Passive Runtime Character",
    }).returning({ id: campaignCharacter.id });
    const [abilityRow] = await tx.insert(derivedAbility).values({
      name: `Passive Runtime Ability ${suffix}`,
      acquisitionType: "automatic",
      activationType: "passive",
      createdByUserId: godId,
    }).returning({ id: derivedAbility.id });
    assert.ok(characterRow && abilityRow);
    await tx.insert(campaignAllowedSystem).values({
      campaignId: campaignRow.id,
      system: "Derived Abilities",
      sortOrder: 0,
    });
    const effects = encodeDerivedAbilityEffects([
      { kind: "condition.apply", name: "Passive Focus", description: "Projected once.", duration: { kind: "until-removed" } },
      { kind: "modifier.apply", label: "Passive Strength", channel: "attribute", targetKey: "STR", amount: 2, duration: { kind: "until-removed" } },
      { kind: "health.heal", amount: 3, scope: "full-body" },
      { kind: "health.damage", amount: 2, application: "localized" },
      { kind: "manual", title: "Ongoing Table Rule", description: "Apply the authored narrative rule." },
    ]);
    await tx.insert(derivedAbilityEffect).values(effects.map((effect) => ({
      derivedAbilityId: abilityRow.id,
      ...effect,
    })));

    const first = await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, characterRow.id, godId);
    assert.equal(first.created.length, 2);
    assert.equal(first.manualSteps.length, 3);
    const activeCounts = async () => ({
      conditions: Number((await tx.select({ value: count() }).from(campaignCharacterActiveCondition).where(and(
        eq(campaignCharacterActiveCondition.characterId, characterRow.id),
        eq(campaignCharacterActiveCondition.sourceKind, "derived-ability"),
        isNull(campaignCharacterActiveCondition.resolvedAt),
      )))[0]?.value ?? 0),
      modifiers: Number((await tx.select({ value: count() }).from(campaignCharacterActiveModifier).where(and(
        eq(campaignCharacterActiveModifier.characterId, characterRow.id),
        eq(campaignCharacterActiveModifier.sourceKind, "derived-ability"),
        isNull(campaignCharacterActiveModifier.endedAt),
      )))[0]?.value ?? 0),
    });
    assert.deepEqual(await activeCounts(), { conditions: 1, modifiers: 1 });

    const second = await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, characterRow.id, godId);
    assert.deepEqual(second.created, []);
    assert.deepEqual(await activeCounts(), { conditions: 1, modifiers: 1 });

    await tx.delete(campaignAllowedSystem).where(and(
      eq(campaignAllowedSystem.campaignId, campaignRow.id),
      eq(campaignAllowedSystem.system, "Derived Abilities"),
    ));
    const unavailable = await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, characterRow.id, godId);
    assert.equal(unavailable.resolved.length, 1);
    assert.equal(unavailable.ended.length, 1);
    assert.deepEqual(await activeCounts(), { conditions: 0, modifiers: 0 });

    await tx.insert(campaignAllowedSystem).values({
      campaignId: campaignRow.id,
      system: "Derived Abilities",
      sortOrder: 0,
    });
    const restored = await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, characterRow.id, godId);
    assert.equal(restored.created.length, 2);
    assert.deepEqual(await activeCounts(), { conditions: 1, modifiers: 1 });
    assert.equal(Number((await tx.select({ value: count() }).from(campaignCharacterActiveHealth).where(
      eq(campaignCharacterActiveHealth.characterId, characterRow.id),
    ))[0]?.value ?? 0), 0);
    assert.equal(Number((await tx.select({ value: count() }).from(characterDerivedAbilityUse).where(
      eq(characterDerivedAbilityUse.characterId, characterRow.id),
    ))[0]?.value ?? 0), 0);

    tx.rollback();
  }).catch((error) => {
    if (!(error instanceof Error && error.message === "Rollback")) throw error;
  });
});
