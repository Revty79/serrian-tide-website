import assert from "node:assert/strict";
import type { Pool } from "pg";
import manifest from "../data/canon/catalog-classification-manifest.json";

/** Explicitly synthetic records, restricted to the two disposable harness databases. */
export async function seedClassificationFixtures(pool: Pool) {
  const database = (await pool.query("select current_database() name")).rows[0].name;
  assert.ok(["serrian_catalog_visibility_dev", "serrian_profile_browser_dev"].includes(database));
  for (const [key, table] of [["race", "races"], ["skill", "skill"], ["derivedAbility", "derived_ability"]] as const) {
    await pool.query(`insert into ${table} (name,source_system,source_external_id)
      select name,"sourceSystem","externalId" from jsonb_to_recordset($1::jsonb) as x(name text,"sourceSystem" text,"externalId" text)
      on conflict do nothing`, [JSON.stringify(manifest[key])]);
  }
  await pool.query(`insert into creatures (canonical_id,canonical_name,source_system,size)
    select "externalId",name,"sourceSystem",'Medium' from jsonb_to_recordset($1::jsonb) as x(name text,"sourceSystem" text,"externalId" text)
    on conflict do nothing`, [JSON.stringify(manifest.creature)]);
}
