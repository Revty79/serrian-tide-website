import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !url.pathname.endsWith("_dev")) throw new Error("Read-only loopback DEV inspection only.");
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query("begin transaction isolation level repeatable read read only");
  const declarations = (await client.query(`select d.id, d.encounter_id, d.actor_character_id, d.status,
    d.locked_snapshot_json->>'label' label, p.status timing, p.remaining_initiative_cost,
    (select jsonb_agg(jsonb_build_object('id', f.id, 'status', f.status, 'portion', f.firearm_portion,
      'effects', (select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.effect_type, 'status', e.status,
        'target', e.target_participant_id, 'value', e.final_value_json)) from campaign_session_encounter_effect e where e.plan_id=f.id)))
     from campaign_session_encounter_effect_plan f where f.declaration_id=d.id) plans
    from campaign_session_encounter_action_declaration d
    left join campaign_session_encounter_pending_action p on p.id=d.pending_action_id
    order by d.id desc limit 30`)).rows;
  console.log(JSON.stringify({ declarations }, null, 2));
  await client.query("commit");
} finally { await client.end(); }
