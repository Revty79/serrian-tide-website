import { db, pool } from "@/db";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";
async function main() {
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/serrian_runner_dev") throw new Error("Only the isolated runner database may be seeded.");
const password = "Runner-Rehearsal-Only-2026!";
const fixture = await db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "runner");
    // Setup only: no direct state changes after play begins below.
    await tx.execute(sql`delete from campaign_session_encounter_reaction where encounter_id=${base.encounterId}`);
    await tx.execute(sql`delete from campaign_session_encounter_pending_action_source where encounter_id=${base.encounterId}`);
    await tx.execute(sql`delete from campaign_session_encounter_pending_action where encounter_id=${base.encounterId}`);
    await tx.execute(sql`update campaign_session_encounter_initiative set round_number=1,step_number=1,timeline_initiative=11 where encounter_id=${base.encounterId}`);
    await tx.execute(sql`update campaign_session_encounter_initiative_participant set normal_total_initiative=11,current_initiative=11 where encounter_id=${base.encounterId}`);
    for (const id of [base.heroId, base.defenderId]) for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
      await tx.execute(sql`insert into campaign_character_attribute (character_id,attribute_key,value) values (${id},${key},30)`);
    }
    const suffix = crypto.randomUUID().toUpperCase();
    const item = await tx.execute(sql`insert into items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id) values (${suffix},'Runner sword','equipment','weapon','Weapon','Test','Melee','unit',${base.godId}) returning id`);
    const itemId = Number((item.rows[0] as { id: number }).id);
    const profile = await tx.execute(sql`insert into weapon_profiles (item_id,profile_record_type,weapon_type,handedness,damage_source,damage,initiative_cost,damage_type,reach_text) values (${itemId},'Weapon','Melee','One-handed','STR','2',4,'Slashing','Close') returning id`);
    const profileId = Number((profile.rows[0] as { id: number }).id);
    const skill = await tx.execute(sql`insert into skill (name,classification,tier,primary_attribute,created_by_user_id) values (${`Runner melee ${suffix}`},'standard',1,'DEX',${base.godId}) returning id`);
    const skillId = Number((skill.rows[0] as { id: number }).id);
    await tx.execute(sql`insert into weapon_skill_path_mappings (weapon_profile_id,endpoint_skill_id,review_state,sort_order,updated_by_user_id) values (${profileId},${skillId},'approved',0,${base.godId})`);
    await tx.execute(sql`insert into campaign_inventory_item (campaign_id,item_id,sort_order) values (${base.campaignId},${itemId},0)`);
    await tx.execute(sql`insert into item_runtime_profiles (item_id,use_mode,activation_label) values (${itemId},'none','Use')`);
    for (const id of [base.heroId, base.defenderId]) {
      await tx.execute(sql`insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values (${id},${itemId},1,0)`);
      await tx.execute(sql`insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity) values (${id},${itemId},'wielded',1)`);
    }

    // A real race movement source is required to rehearse movement from the UI.
    const race = await tx.execute(sql`insert into races (name,size,created_by_user_id) values ('Runner human','Medium',${base.godId}) returning id`);
    const raceId = Number((race.rows[0] as { id: number }).id);
    await tx.execute(sql`insert into race_movement_modes (race_id,movement_mode,base_value) values (${raceId},'land',3)`);
    for (const characterId of [base.heroId,base.defenderId]) {
      await tx.execute(sql`insert into campaign_character_profile (character_id,race_id) values (${characterId},${raceId}) on conflict (character_id) do update set race_id=excluded.race_id`);
    }
    await tx.execute(sql`update campaign_session_encounter_initiative_participant set movement_mode='land' where encounter_id=${base.encounterId}`);

    const playerId = `runner-player-${crypto.randomUUID()}`;
    const playerEmail = `${playerId}@example.invalid`;
    const godEmail = `${base.godId}@example.invalid`;
    await tx.execute(sql`update "user" set email_verified=true where id=${base.godId}`);
    await tx.execute(sql`insert into "user" (id,name,email,email_verified,username,display_username) values (${playerId},'Runner Player',${playerEmail},true,${playerId},${playerId})`);
    await tx.execute(sql`insert into user_role (user_id,role) values (${base.godId},'god'),(${playerId},'player')`);
    await tx.execute(sql`insert into campaign_player (campaign_id,user_id,is_npc_controller) values (${base.campaignId},${playerId},false)`);
    await tx.execute(sql`update campaign_player set is_npc_controller=true where campaign_id=${base.campaignId} and user_id=${base.godId}`);
    await tx.execute(sql`update campaign_character set player_user_id=${playerId},name='Runner Hero' where id=${base.heroId}`);
    await tx.execute(sql`update campaign_character set name='Runner Bandit' where id=${base.defenderId}`);
    const hash = await hashPassword(password);
    for (const id of [base.godId, playerId]) await tx.execute(sql`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values (${`${id}-credential`},'local:credential',${id},'credential',${id},${hash},now())`);
    await tx.execute(sql`insert into defense_skill_path_mapping (defense_type,endpoint_skill_id,review_state,conditional,circumstance_label,notes,sort_order,updated_by_user_id) values ('dodge',${skillId},'approved',false,'','Disposable runner test',0,${base.godId})`);
    return { ...base, playerId, playerEmail, godEmail, password, itemId };
});
await writeFile(process.env.RUNNER_FIXTURE_FILE ?? join(tmpdir(), 'serrian-runner-fixture.json'), JSON.stringify(fixture), { mode: 0o600 });
console.log('Created isolated campaign', fixture.campaignId);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
