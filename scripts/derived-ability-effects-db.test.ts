import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";

import pg, { type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Derived Ability effect DB validation.");
}
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Derived Ability effect DB tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(
    `Refusing Derived Ability effect DB tests against non-development database ${databaseUrl.pathname.slice(1)}.`,
  );
}

const pool = new pg.Pool({ connectionString });
const migration = readFileSync(
  path.resolve(process.cwd(), "drizzle/0019_derived_ability_mechanical_effects.sql"),
  "utf8",
).replaceAll("--> statement-breakpoint", "");
let savepointSequence = 0;

async function expectRejection(
  client: PoolClient,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  const savepoint = `derived_effect_rejection_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected PostgreSQL to reject the invalid effect row.");
  assert.match(caught instanceof Error ? caught.message : String(caught), expected);
}

after(async () => {
  await pool.end();
});

test("0019 preserves ordered effects, enforces checks, and cascades in an isolated transaction", { timeout: 30_000 }, async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ table_name: string | null }>(
      "select to_regclass('public.derived_ability_effect')::text as table_name",
    );
    if (existing.rows[0]?.table_name === null) await client.query(migration);

    const ability = await client.query<{ id: number }>(`
      insert into derived_ability (name, description, mechanical_effect)
      values ($1, '', $2)
      returning id
    `, ["Pass 5 DB Test", "Human Rules Text remains independent."]);
    const abilityId = ability.rows[0]!.id;

    await client.query(`
      insert into derived_ability_effect
        (derived_ability_id, schema_version, effect_json, sort_order)
      values
        ($1, 2, $2::jsonb, 0),
        ($1, 2, $3::jsonb, 1),
        ($1, 2, $4::jsonb, 2)
    `, [
      abilityId,
      JSON.stringify({ kind: "condition.apply", name: "Hamstrung", description: "Impaired.", duration: { kind: "combat-rounds", value: 2 } }),
      JSON.stringify({ kind: "modifier.apply", label: "Movement penalty", channel: "movement", targetKey: "movement:Land", amount: -10, duration: { kind: "combat-rounds", value: 2 } }),
      JSON.stringify({ kind: "manual", title: "Anatomy ruling", description: "G.O.D. resolves anatomy." }),
    ]);

    const rows = await client.query<{ sort_order: number; kind: string }>(`
      select sort_order, effect_json->>'kind' as kind
      from derived_ability_effect
      where derived_ability_id = $1
      order by sort_order, id
    `, [abilityId]);
    assert.deepEqual(rows.rows, [
      { sort_order: 0, kind: "condition.apply" },
      { sort_order: 1, kind: "modifier.apply" },
      { sort_order: 2, kind: "manual" },
    ]);

    await expectRejection(client, () => client.query(`
      insert into derived_ability_effect
        (derived_ability_id, schema_version, effect_json, sort_order)
      values ($1, 2, '{}'::jsonb, 0)
    `, [abilityId]), /derived_ability_effect_order_uq/);
    await expectRejection(client, () => client.query(`
      insert into derived_ability_effect
        (derived_ability_id, schema_version, effect_json, sort_order)
      values ($1, 0, '{}'::jsonb, 3)
    `, [abilityId]), /derived_ability_effect_schema_version_valid/);
    await expectRejection(client, () => client.query(`
      insert into derived_ability_effect
        (derived_ability_id, schema_version, effect_json, sort_order)
      values ($1, 2, '[]'::jsonb, 3)
    `, [abilityId]), /derived_ability_effect_json_object/);

    await client.query("delete from derived_ability where id = $1", [abilityId]);
    const remaining = await client.query<{ count: number }>(`
      select count(*)::int as count
      from derived_ability_effect
      where derived_ability_id = $1
    `, [abilityId]);
    assert.equal(remaining.rows[0]?.count, 0);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
});
