import dotenv from "dotenv";
import pg from "pg";

import { resolveCreatureHpModel } from "../src/features/creatures/creature-size-rules";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");

const apply = process.argv.includes("--apply");
const connection = new URL(connectionString);
const client = new pg.Client({ connectionString });

type CreatureRow = {
  id: number;
  size: string;
  hp_multiplier_steps: number;
  constitution: number | null;
};

type PoolRow = {
  id: number;
  creature_id: number;
  canonical_id: string;
  hp_percentage: number | null;
};

await client.connect();
try {
  await client.query("begin");
  const creatures = await client.query<CreatureRow>(`
    select
      creatures.id,
      creatures.size,
      creatures.hp_multiplier_steps,
      constitution.value as constitution
    from creatures
    left join creature_attributes constitution
      on constitution.creature_id = creatures.id
     and constitution.variant_id is null
     and constitution.attribute_key = 'Constitution'
    order by creatures.id
  `);
  const pools = await client.query<PoolRow>(`
    select id, creature_id, canonical_id, hp_percentage
    from creature_hp_pools
    where variant_id is null
    order by creature_id, sort_order, id
  `);
  const poolsByCreature = new Map<number, PoolRow[]>();
  for (const pool of pools.rows) {
    poolsByCreature.set(pool.creature_id, [
      ...(poolsByCreature.get(pool.creature_id) ?? []),
      pool,
    ]);
  }

  let updatedPools = 0;
  for (const creature of creatures.rows) {
    const creaturePools = poolsByCreature.get(creature.id) ?? [];
    const hpModel = resolveCreatureHpModel(
      {
        core: {
          size: creature.size,
          hpMultiplierSteps: creature.hp_multiplier_steps,
        },
        attributes: [{ attributeKey: "Constitution", value: creature.constitution }],
      },
      creaturePools.map((pool) => ({
        canonicalId: pool.canonical_id,
        hpPercentage: pool.hp_percentage,
        databaseId: pool.id,
      })),
    );
    await client.query("update creatures set total_hp = $1 where id = $2", [
      hpModel.calculatedTotalHp,
      creature.id,
    ]);
    for (const pool of hpModel.pools) {
      await client.query("update creature_hp_pools set maximum_hp = $1 where id = $2", [
        pool.maximumHp,
        pool.databaseId,
      ]);
      updatedPools += 1;
    }
  }

  if (apply) {
    await client.query("commit");
  } else {
    await client.query("rollback");
  }
  console.log(
    `${apply ? "Applied" : "Dry run only"}: ${creatures.rowCount ?? 0} Creatures and ${updatedPools} HP Pools at ${connection.hostname}/${connection.pathname.slice(1)}.`,
  );
  if (!apply) console.log("No rows were changed. Re-run with --apply after reviewing the target.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
