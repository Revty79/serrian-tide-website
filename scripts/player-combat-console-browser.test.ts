import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 13 browser workflow.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Pass 13 browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "Pass13-Browser-Only!";
const PORT = 3134;
const BASE_URL = `http://localhost:${PORT}`;
const DIST_DIRECTORY = ".next-player-combat-browser";
const PREFIX = "pass13-browser-";

type Fixture = {
  marker: string;
  godId: string;
  playerId: string;
  targetPlayerId: string;
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  playerCharacterId: number;
  targetCharacterId: number;
  persistentNpcId: number;
  creatureId: number;
  weaponItemId: number;
  firearmItemId: number;
  ammunitionItemId: number;
  firearmInstanceId: number;
  firingModeId: number;
  rootSkillId: number;
  endpointSkillId: number;
  rootSkillName: string;
  endpointSkillName: string;
  godEmail: string;
  playerEmail: string;
  targetPlayerEmail: string;
};

async function one<T extends pg.QueryResultRow>(client: pg.PoolClient, query: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  const marker = `${PREFIX}${Date.now()}`;
  const godId = `${marker}-god`;
  const playerId = `${marker}-player`;
  const targetPlayerId = `${marker}-target`;
  const godEmail = `${godId}@example.invalid`;
  const playerEmail = `${playerId}@example.invalid`;
  const targetPlayerEmail = `${targetPlayerId}@example.invalid`;
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    for (const entry of [
      { id: godId, name: "Pass 13 Browser G.O.D.", email: godEmail, role: "god" },
      { id: playerId, name: "Pass 13 Browser Player", email: playerEmail, role: "player" },
      { id: targetPlayerId, name: "Pass 13 Target Player", email: targetPlayerEmail, role: "player" },
    ]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)`, [entry.id, entry.name, entry.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${entry.id}-credential`, entry.id, password]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [entry.id, entry.role]);
    }
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Player combat browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [marker, godId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false),($1,$4,false)", [campaign.id, godId, playerId, targetPlayerId]);
    const playerCharacter = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Player Console Hero') returning id", [campaign.id, playerId]);
    const targetCharacter = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Another Player Character') returning id", [campaign.id, targetPlayerId]);
    const persistentNpc = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind) values ($1,$2,'Browser Sentry NPC',true,'race') returning id", [campaign.id, godId]);
    for (const characterId of [playerCharacter.id, targetCharacter.id, persistentNpc.id]) {
      await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,0)", [characterId]);
      await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [characterId]);
      for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
        await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,30)", [characterId, key]);
      }
    }
    const weapon = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id
    ) values ($1,'Browser Tide Saber','equipment','weapon','Weapon','Browser','Melee','per item',$2,$3,$1) returning id`, [`PASS13-WEAPON-${Date.now()}`, godId, marker]);
    await client.query("insert into item_runtime_profiles (item_id,use_mode,activation_label) values ($1,'none','Use')", [weapon.id]);
    await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [campaign.id, weapon.id]);
    const profile = await one<{ id: number }>(client, `insert into weapon_profiles
      (item_id,profile_record_type,weapon_type,handedness,damage_source,damage,initiative_cost,damage_type,reach_text)
      values ($1,'Weapon','Melee','One-handed','STR','2',3,'Slashing','Close') returning id`, [weapon.id]);
    const rootSkillName = `Browser Close Combat ${marker}`;
    const endpointSkillName = `Browser Saber Mastery ${marker}`;
    const rootSkill = await one<{ id: number }>(client, `insert into skill
      (name,classification,tier,primary_attribute,created_by_user_id,source_system,source_external_id)
      values ($1,'standard',1,'DEX',$2,$3,$4) returning id`, [rootSkillName, godId, marker, `${marker}-root`]);
    const endpointSkill = await one<{ id: number }>(client, `insert into skill
      (name,classification,tier,primary_attribute,created_by_user_id,source_system,source_external_id)
      values ($1,'standard',2,'DEX',$2,$3,$4) returning id`, [endpointSkillName, godId, marker, `${marker}-endpoint`]);
    await client.query("insert into skill_relationship (skill_id,related_skill_id,relationship_type,sort_order) values ($1,$2,'parent',0)", [endpointSkill.id, rootSkill.id]);
    await client.query(`insert into weapon_skill_path_mappings
      (weapon_profile_id,endpoint_skill_id,review_state,notes,sort_order,updated_by_user_id)
      values ($1,$2,'approved','Pass 13 exact browser route.',0,$3)`, [profile.id, endpointSkill.id, godId]);
    await client.query("insert into campaign_character_skill_allocation (character_id,skill_id,points) values ($1,$2,18),($3,$2,18)", [playerCharacter.id, rootSkill.id, targetCharacter.id]);
    await client.query(`insert into defense_skill_path_mapping
      (defense_type,endpoint_skill_id,review_state,conditional,circumstance_label,notes,sort_order,updated_by_user_id)
      values ('dodge',$1,'approved',false,'','Pass 13 browser exact Dodge route.',0,$2)`, [rootSkill.id, godId]);
    await client.query("insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values ($1,$3,1,0),($2,$3,1,0)", [playerCharacter.id, targetCharacter.id, weapon.id]);
    await client.query("insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity) values ($1,$3,'wielded',1),($2,$3,'wielded',1)", [playerCharacter.id, targetCharacter.id, weapon.id]);
    const ammunition = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id
    ) values ($1,'Browser Exact Cartridge','inventory','Ammunition','Browser','Ammunition','per round',$2,$3,$1) returning id`, [`PASS13-AMMO-${Date.now()}`, godId, marker]);
    await client.query("insert into item_runtime_profiles (item_id,use_mode,activation_label) values ($1,'none','Use')", [ammunition.id]);
    const ammunitionProfile = await one<{ id: number }>(client, "insert into weapon_profiles (item_id,profile_record_type,damage,damage_type,ammunition_cycling_initiative_modifier,ammunition_recoil_reset_initiative_modifier) values ($1,'Ammunition','8','Ballistic',0,0) returning id", [ammunition.id]);
    const firearm = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id
    ) values ($1,'Browser Service Pistol','equipment','weapon','Weapon','Browser','Firearm','per item',$2,$3,$1) returning id`, [`PASS13-FIREARM-${Date.now()}`, godId, marker]);
    await client.query("insert into item_runtime_profiles (item_id,use_mode,activation_label) values ($1,'none','Use')", [firearm.id]);
    const firearmProfile = await one<{ id: number }>(client, `insert into weapon_profiles
      (item_id,profile_record_type,weapon_type,damage_source,ammunition_item_id,range_text,capacity_rounds,readiness_mode,draw_initiative_cost,ready_initiative_cost,reload_initiative_cost,unload_initiative_cost,firing_mode_change_initiative_cost)
      values ($1,'Weapon','Handgun','Ammunition',$2,'Ranged',6,'draw-is-ready',0,0,0,0,0) returning id`, [firearm.id, ammunition.id]);
    const firingMode = await one<{ id: number }>(client, "insert into weapon_firing_modes (weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence) values ($1,'Single','single',0,0,0,'per-trigger',1) returning id", [firearmProfile.id]);
    await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,1),($1,$3,2)", [campaign.id, ammunition.id, firearm.id]);
    await client.query(`insert into weapon_skill_path_mappings
      (weapon_profile_id,firing_mode_id,endpoint_skill_id,review_state,notes,sort_order,updated_by_user_id)
      values ($1,$2,$3,'approved','Pass 13 exact firearm route.',0,$4)`, [firearmProfile.id, firingMode.id, endpointSkill.id, godId]);
    await client.query("insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values ($1,$2,4,2)", [playerCharacter.id, ammunition.id]);
    const firearmInstance = await one<{ id: number }>(client, "insert into campaign_character_item_instance (character_id,item_id,current_charges,equipment_state,unit_cost_credits) values ($1,$2,0,'wielded',100) returning id", [playerCharacter.id, firearm.id]);
    await client.query(`insert into campaign_character_firearm_state (
      item_instance_id,campaign_id,character_id,item_id,weapon_profile_id,selected_firing_mode_id,
      loaded_ammunition_item_id,loaded_ammunition_profile_id,loaded_ammunition_unit_cost_credits,loaded_rounds,
      capacity_rounds,capacity_source,readiness_mode,readiness_mode_source,readied,requires_cycling,requires_recoil_recovery,
      version,initialization_key,initialized_by_user_id,updated_by_user_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,2,2,6,'canonical','draw-is-ready','canonical',true,false,false,1,$9,$10,$10)`, [firearmInstance.id, campaign.id, playerCharacter.id, firearm.id, firearmProfile.id, firingMode.id, ammunition.id, ammunitionProfile.id, `${marker}-firearm-init`, godId]);
    const creature = await one<{ id: number }>(client, `insert into creatures (
      canonical_id,canonical_name,family,creature_type,size,description,created_by_user_id,source_system
    ) values ($1,'Tide Maw','Browser fixtures','Creature','Medium','An exact direct Encounter Creature target.',$2,$3) returning id`, [`PASS13-${Date.now()}`, godId, marker]);
    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Pass 13 Live Session','active',now()) returning id", [campaign.id]);
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0),($1,$2,$4,1),($1,$2,$5,2)", [session.id, campaign.id, playerCharacter.id, targetCharacter.id, persistentNpc.id]);
    const scene = await one<{ id: number }>(client, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at,god_notes) values ($1,$2,1,'Pass 13 Scene','active',now(),'PRIVATE SCENE NOTE') returning id", [session.id, campaign.id]);
    await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0),($1,$2,$3,$5,1),($1,$2,$3,$6,2)", [scene.id, session.id, campaign.id, playerCharacter.id, targetCharacter.id, persistentNpc.id]);
    const encounter = await one<{ id: number }>(client, "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,status,encounter_type,started_at,god_notes) values ($1,$2,$3,1,'Pass 13 Encounter','active','combat',now(),'PRIVATE ENCOUNTER NOTE') returning id", [scene.id, session.id, campaign.id]);
    await client.query(`insert into campaign_session_encounter_participant
      (encounter_id,scene_id,session_id,campaign_id,character_id,participant_kind,creature_id,display_label,creature_snapshot_json,local_state_json,sort_order)
      values ($1,$2,$3,$4,$5,'campaign-character',null,'',null,null,0),
             ($1,$2,$3,$4,$6,'campaign-character',null,'',null,null,1),
             ($1,$2,$3,$4,$7,'campaign-character',null,'',null,null,2),
             ($1,$2,$3,$4,-1,'creature',$8,'Tide Maw',$9::jsonb,'{"wounds":1}'::jsonb,3),
             ($1,$2,$3,$4,-2,'creature',$8,'Tide Maw II',$9::jsonb,'{"wounds":3}'::jsonb,4)`, [
      encounter.id, scene.id, session.id, campaign.id, playerCharacter.id, targetCharacter.id, persistentNpc.id, creature.id,
      JSON.stringify({ canonicalId: `PASS13-${creature.id}`, canonicalName: "Tide Maw", attacks: [], abilities: [] }),
    ]);
    await client.query("insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,timeline_initiative) values ($1,$2,$3,$4,20)", [encounter.id, scene.id, session.id, campaign.id]);
    await client.query(`insert into campaign_session_encounter_initiative_participant
      (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative,movement_mode)
      values ($1,$2,$3,$4,$5,20,20,'Walk'),($1,$2,$3,$4,$6,18,18,'Walk'),($1,$2,$3,$4,-1,16,16,'Walk'),($1,$2,$3,$4,-2,15,15,'Walk')`, [encounter.id, scene.id, session.id, campaign.id, playerCharacter.id, targetCharacter.id]);
    await client.query("commit");
    return {
      marker,
      godId,
      playerId,
      targetPlayerId,
      campaignId: campaign.id,
      sessionId: session.id,
      sceneId: scene.id,
      encounterId: encounter.id,
      playerCharacterId: playerCharacter.id,
      targetCharacterId: targetCharacter.id,
      persistentNpcId: persistentNpc.id,
      creatureId: creature.id,
      weaponItemId: weapon.id,
      firearmItemId: firearm.id,
      ammunitionItemId: ammunition.id,
      firearmInstanceId: firearmInstance.id,
      firingModeId: firingMode.id,
      rootSkillId: rootSkill.id,
      endpointSkillId: endpointSkill.id,
      rootSkillName,
      endpointSkillName,
      godEmail,
      playerEmail,
      targetPlayerEmail,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool, fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  await pool.query("delete from campaign_session_player_ruling_request_event where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_player_ruling_request where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_effect_plan_event where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_effect where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_firearm_bullet where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_firearm_attack_event where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_firearm_attack where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_effect_plan where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_roll_amendment where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_roll where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_responder_opportunity where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_reaction_event where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_reaction where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_action_declaration_event where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_action_declaration where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_pending_action_source where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_pending_action where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_character_firearm_event where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_character_firearm_preparation where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_character_firearm_state where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_initiative_participant where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_initiative where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter_participant where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_encounter where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_scene_member where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_scene where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session_roster where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign_session where campaign_id=$1", [fixture.campaignId]);
  await pool.query("delete from campaign where id=$1", [fixture.campaignId]);
  await pool.query("delete from creatures where id=$1", [fixture.creatureId]);
  await pool.query("delete from defense_skill_path_mapping where updated_by_user_id=$1", [fixture.godId]);
  await pool.query("delete from weapon_skill_path_mappings where updated_by_user_id=$1", [fixture.godId]);
  await pool.query("delete from skill_relationship where skill_id=$1 and related_skill_id=$2", [fixture.endpointSkillId, fixture.rootSkillId]);
  await pool.query("delete from weapon_firing_modes where weapon_profile_id in (select id from weapon_profiles where item_id=any($1::int[]))", [[fixture.weaponItemId, fixture.firearmItemId, fixture.ammunitionItemId]]);
  await pool.query("delete from weapon_profiles where item_id=any($1::int[])", [[fixture.weaponItemId, fixture.firearmItemId, fixture.ammunitionItemId]]);
  await pool.query("delete from items where id=any($1::int[])", [[fixture.weaponItemId, fixture.firearmItemId, fixture.ammunitionItemId]]);
  await pool.query("delete from skill where id=any($1::int[])", [[fixture.rootSkillId, fixture.endpointSkillId]]);
  await pool.query(`delete from "user" where id=any($1::text[])`, [[fixture.godId, fixture.playerId, fixture.targetPlayerId]]);
}

async function cleanupStaleFixtures(pool: pg.Pool): Promise<void> {
  const campaigns = await pool.query<{ id: number }>("select id from campaign where name like 'pass13-browser-%'");
  if (campaigns.rows.length) {
    const ids = campaigns.rows.map(({ id }) => id);
    for (const table of [
      "campaign_session_player_ruling_request_event",
      "campaign_session_player_ruling_request",
      "campaign_session_encounter_effect_plan_event",
      "campaign_session_encounter_effect",
      "campaign_session_encounter_firearm_bullet",
      "campaign_session_encounter_firearm_attack_event",
      "campaign_session_encounter_firearm_attack",
      "campaign_session_encounter_effect_plan",
      "campaign_session_roll_amendment",
      "campaign_session_roll",
      "campaign_session_encounter_responder_opportunity",
      "campaign_session_encounter_reaction_event",
      "campaign_session_encounter_reaction",
      "campaign_session_encounter_action_declaration_event",
      "campaign_session_encounter_action_declaration",
      "campaign_session_encounter_pending_action_source",
      "campaign_session_encounter_pending_action",
      "campaign_character_firearm_event",
      "campaign_character_firearm_preparation",
      "campaign_character_firearm_state",
      "campaign_session_encounter_initiative_participant",
      "campaign_session_encounter_initiative",
      "campaign_session_encounter_participant",
      "campaign_session_encounter",
      "campaign_session_scene_member",
      "campaign_session_scene",
      "campaign_session_roster",
      "campaign_session",
    ]) await pool.query(`delete from ${table} where campaign_id=any($1::int[])`, [ids]);
    await pool.query("delete from campaign where id=any($1::int[])", [ids]);
  }
  await pool.query("delete from creatures where source_system like 'pass13-browser-%'");
  await pool.query("delete from defense_skill_path_mapping where updated_by_user_id like 'pass13-browser-%'");
  await pool.query("delete from weapon_skill_path_mappings where weapon_profile_id in (select weapon_profiles.id from weapon_profiles inner join items on items.id=weapon_profiles.item_id where items.source_system like 'pass13-browser-%')");
  await pool.query("delete from skill_relationship where skill_id in (select id from skill where source_system like 'pass13-browser-%') or related_skill_id in (select id from skill where source_system like 'pass13-browser-%')");
  await pool.query("delete from weapon_firing_modes where weapon_profile_id in (select weapon_profiles.id from weapon_profiles inner join items on items.id=weapon_profiles.item_id where items.source_system like 'pass13-browser-%')");
  await pool.query("delete from weapon_profiles where item_id in (select id from items where source_system like 'pass13-browser-%')");
  await pool.query("delete from items where source_system like 'pass13-browser-%'");
  await pool.query("delete from skill where source_system like 'pass13-browser-%'");
  await pool.query(`delete from "user" where id like 'pass13-browser-%'`);
}

async function resetActionRuntime(pool: pg.Pool, fixture: Fixture): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const table of [
      "campaign_session_roll_amendment",
      "campaign_session_roll",
      "campaign_session_encounter_responder_opportunity",
      "campaign_session_encounter_reaction_event",
      "campaign_session_encounter_reaction",
      "campaign_session_encounter_action_declaration_event",
      "campaign_session_encounter_action_declaration",
      "campaign_session_encounter_pending_action_source",
      "campaign_session_encounter_pending_action",
    ]) await client.query(`delete from ${table} where campaign_id=$1`, [fixture.campaignId]);
    await client.query("delete from campaign_session_encounter_initiative_participant where campaign_id=$1", [fixture.campaignId]);
    await client.query("update campaign_session_encounter_initiative set status='active',round_number=1,step_number=1,timeline_initiative=20,closed_at=null,updated_at=now() where encounter_id=$1", [fixture.encounterId]);
    await client.query(`insert into campaign_session_encounter_initiative_participant
      (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative,movement_mode)
      values ($1,$2,$3,$4,$5,20,20,'Walk'),($1,$2,$3,$4,$6,18,18,'Walk'),($1,$2,$3,$4,-1,16,16,'Walk')`, [
      fixture.encounterId, fixture.sceneId, fixture.sessionId, fixture.campaignId, fixture.playerCharacterId, fixture.targetCharacterId,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* server still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Pass 13 browser-test server.");
}

async function eventually(check: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 125));
  }
  throw new Error(message);
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  return page;
}

async function runWorkflow(player: Page, targetPlayer: Page, god: Page, fixture: Fixture, pool: pg.Pool): Promise<void> {
  await player.goto(`${BASE_URL}/realms/tabletop?character=${fixture.playerCharacterId}`);
  await player.getByRole("heading", { name: "Round 1 · Step 1" }).waitFor();
  await targetPlayer.goto(`${BASE_URL}/realms/tabletop?character=${fixture.targetCharacterId}`);
  await targetPlayer.getByRole("heading", { name: "Round 1 · Step 1" }).waitFor();
  const playerText = await player.locator("main").innerText();
  for (const secret of ["PRIVATE SCENE NOTE", "PRIVATE ENCOUNTER NOTE"]) assert.equal(playerText.includes(secret), false);
  const participantProof = await pool.query<{ participant_kind: string; character_id: number; local_state_json: { wounds?: number } }>(
    "select participant_kind,character_id,local_state_json from campaign_session_encounter_participant where encounter_id=$1 order by sort_order",
    [fixture.encounterId],
  );
  assert.deepEqual(participantProof.rows.filter(({ participant_kind }) => participant_kind === "creature").map(({ character_id, local_state_json }) => ({ characterId: character_id, wounds: local_state_json.wounds })), [
    { characterId: -1, wounds: 1 },
    { characterId: -2, wounds: 3 },
  ]);
  assert.equal(participantProof.rows.some(({ participant_kind, character_id }) => participant_kind === "campaign-character" && character_id === fixture.persistentNpcId), true);
  assert.equal((await pool.query("select id from campaign_character where campaign_id=$1 and id in (-1,-2)", [fixture.campaignId])).rowCount, 0);
  assert.equal((await pool.query("select character_id from campaign_character_active_health where character_id in (-1,-2)")).rowCount, 0);
  assert.equal((await pool.query("select character_id from campaign_character_item where character_id in (-1,-2)")).rowCount, 0);

  let weaponPanel = player.getByRole("region", { name: "Melee and authored weapons" });
  let responsePanel = targetPlayer.getByRole("region", { name: "Choose a response before the action can Roll" });
  let lockedPanel = player.getByRole("region", { name: "Declarations, Rolls and results" });
  let targetLockedPanel = targetPlayer.getByRole("region", { name: "Declarations, Rolls and results" });
  async function resetBrowserAction(closeGodPage = false): Promise<void> {
    const playerContext = player.context();
    const targetContext = targetPlayer.context();
    const godContext = god.context();
    await Promise.all([player.close(), targetPlayer.close(), ...(closeGodPage ? [god.close()] : [])]);
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
    for (let attempt = 0; ; attempt += 1) {
      try {
        await resetActionRuntime(pool, fixture);
        break;
      } catch (error) {
        if (attempt >= 4 || !(error instanceof Error) || (error as Error & { code?: string }).code !== "40P01") throw error;
        await new Promise((resolveWait) => setTimeout(resolveWait, 250 * (attempt + 1)));
      }
    }
    player = await playerContext.newPage();
    targetPlayer = await targetContext.newPage();
    if (closeGodPage) god = await godContext.newPage();
    await Promise.all([
      player.goto(`${BASE_URL}/realms/tabletop?character=${fixture.playerCharacterId}`),
      targetPlayer.goto(`${BASE_URL}/realms/tabletop?character=${fixture.targetCharacterId}`),
    ]);
    await Promise.all([
      player.getByRole("heading", { name: "Round 1 · Step 1" }).waitFor(),
      targetPlayer.getByRole("heading", { name: "Round 1 · Step 1" }).waitFor(),
    ]);
    weaponPanel = player.getByRole("region", { name: "Melee and authored weapons" });
    responsePanel = targetPlayer.getByRole("region", { name: "Choose a response before the action can Roll" });
    lockedPanel = player.getByRole("region", { name: "Declarations, Rolls and results" });
    targetLockedPanel = targetPlayer.getByRole("region", { name: "Declarations, Rolls and results" });
  }
  assert.match(await weaponPanel.innerText(), new RegExp(`Global canonical path: ${fixture.rootSkillName} → ${fixture.endpointSkillName}`));
  assert.match(await weaponPanel.innerText(), new RegExp(`Character fallback: ${fixture.rootSkillName}`));
  await weaponPanel.getByLabel("Exact target").selectOption({ label: "Another Player Character" });
  await weaponPanel.getByRole("button", { name: "Declare and lock" }).click();
  await weaponPanel.getByText("Weapon action locked and committed.", { exact: true }).waitFor();
  await responsePanel.waitFor();
  await responsePanel.getByRole("button", { name: "No Defense" }).click();
  await responsePanel.getByText("No Defense recorded.", { exact: true }).waitFor();
  await eventually(async () => await lockedPanel.getByRole("button", { name: "Website Roll" }).count() === 1, "The bound attack Roll did not open after No Defense.");
  await lockedPanel.getByRole("button", { name: "Website Roll" }).click();
  await lockedPanel.getByText("Attack Roll recorded.", { exact: true }).waitFor();
  const boundRoll = await pool.query<{ declaration_status: string; pending_action_id: number | null }>(`select declaration.status as declaration_status, roll.pending_action_id
      from campaign_session_encounter_action_declaration declaration
      inner join campaign_session_roll roll on roll.pending_action_id=declaration.pending_action_id
      where declaration.campaign_id=$1 and declaration.actor_character_id=$2`, [fixture.campaignId, fixture.playerCharacterId]);
  assert.equal(boundRoll.rows.length, 1);
  assert.ok(["rolling", "awaiting-god-ruling"].includes(boundRoll.rows[0]!.declaration_status));
  assert.ok(boundRoll.rows[0]?.pending_action_id);

  await resetBrowserAction();
  await weaponPanel.getByLabel("Exact target").selectOption({ label: "Another Player Character" });
  await weaponPanel.getByRole("button", { name: "Declare and lock" }).click();
  await responsePanel.getByRole("button", { name: "Dodge · 1 Initiative" }).click();
  await targetLockedPanel.getByRole("button", { name: "Roll response" }).click();
  await targetLockedPanel.getByText("Defense Roll recorded.", { exact: true }).waitFor();
  await eventually(async () => (await pool.query<{ count: number }>("select count(*)::int as count from campaign_session_roll where campaign_id=$1 and reaction_id is not null", [fixture.campaignId])).rows[0]?.count === 1, "The Dodge Roll was not durably recorded before the attack Roll.");
  await eventually(async () => await lockedPanel.getByRole("button", { name: "Website Roll" }).count() === 1, "The attack Roll did not open after Dodge was declared.");
  await lockedPanel.getByRole("button", { name: "Website Roll" }).click();
  await lockedPanel.getByText("Attack Roll recorded.", { exact: true }).waitFor();
  const dodgeProof = await pool.query<{ committed_initiative_cost: number }>("select committed_initiative_cost from campaign_session_encounter_reaction where campaign_id=$1 and reaction_type='dodge'", [fixture.campaignId]);
  assert.deepEqual(dodgeProof.rows, [{ committed_initiative_cost: 1 }]);

  await resetBrowserAction();
  await weaponPanel.getByLabel("Exact target").selectOption({ label: "Another Player Character" });
  await weaponPanel.getByRole("button", { name: "Declare and lock" }).click();
  await responsePanel.getByRole("button", { name: "Parry" }).click();
  await targetLockedPanel.getByLabel("Physical defense Roll").fill("99");
  await targetLockedPanel.getByRole("button", { name: "Enter physical Roll" }).click();
  await targetLockedPanel.getByText("Physical defense Roll recorded.", { exact: true }).waitFor();
  await eventually(async () => (await pool.query<{ count: number }>("select count(*)::int as count from campaign_session_roll where campaign_id=$1 and reaction_id is not null", [fixture.campaignId])).rows[0]?.count === 1, "The Parry Roll was not durably recorded before the attack Roll.");
  await eventually(async () => await lockedPanel.getByRole("button", { name: "Enter physical Roll" }).count() === 1, "The attack Roll did not open after Parry was declared.");
  await lockedPanel.getByLabel("Physical attack Roll").fill("85");
  await lockedPanel.getByRole("button", { name: "Enter physical Roll" }).click();
  await lockedPanel.getByText("Physical attack Roll recorded.", { exact: true }).waitFor();
  await eventually(async () => (await pool.query<{ count: number }>("select count(*)::int as count from campaign_session_encounter_reaction where campaign_id=$1 and reaction_type='parry' and defender_final_cost is not null", [fixture.campaignId])).rows[0]?.count === 1, "The objective Parry reconciliation did not complete with the attack Roll.");
  const parryProof = await pool.query<{ committed_initiative_cost: number; defender_final_cost: number | null; attacker_additional_cost: number | null }>(
    "select committed_initiative_cost,defender_final_cost,attacker_additional_cost from campaign_session_encounter_reaction where campaign_id=$1 and reaction_type='parry'",
    [fixture.campaignId],
  );
  assert.deepEqual(parryProof.rows, [{ committed_initiative_cost: 3, defender_final_cost: 1, attacker_additional_cost: 3 }]);

  await resetBrowserAction();
  const firearmPanel = player.getByRole("region", { name: "Readiness, Aim and attacks" });
  const firearmCard = firearmPanel.getByRole("article").filter({ hasText: "Browser Service Pistol" }).first();
  await firearmCard.getByLabel("Rounds to load").fill("1");
  await firearmCard.getByRole("button", { name: "Add rounds" }).click();
  await firearmPanel.getByText("Reload committed.", { exact: true }).waitFor();
  await eventually(async () => /3 \/ 6 rounds/.test(await firearmCard.innerText()), "The Player reload did not conserve the authoritative firearm load.");

  const requestPanel = player.getByRole("region", { name: "Requests and exceptional intent" });
  await requestPanel.getByLabel("Request type").selectOption("called-shot");
  await requestPanel.getByLabel("Intended target").selectOption({ label: "Another Player Character" });
  await requestPanel.getByLabel("Exact firearm").selectOption(String(fixture.firearmInstanceId));
  await requestPanel.getByLabel("Authored location number, if applicable").fill("4");
  await requestPanel.getByLabel("Your intent").fill("Disable the Tide Maw's grasping limb.");
  await requestPanel.getByRole("button", { name: "Submit request" }).click();
  await requestPanel.getByText(/Called Shot · Pending/).waitFor();

  await god.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}`);
  await god.getByRole("button", { name: /^Scenes/ }).click();
  const godSurface = await god.locator("main").innerText();
  assert.match(godSurface, /Browser Sentry NPC/);
  assert.match(godSurface, /Tide Maw/);
  assert.match(godSurface, /Tide Maw II/);
  const creatureOccurrencesBefore = await pool.query<{ character_id: number }>(
    "select character_id from campaign_session_encounter_participant where encounter_id=$1 and participant_kind='creature' order by character_id",
    [fixture.encounterId],
  );
  await god.getByRole("button", { name: "Add from Creature Catalog" }).click();
  await god.getByRole("searchbox", { name: "Search master Creatures" }).fill("Tide Maw");
  await god.getByRole("button", { name: /^Tide Maw/ }).last().click();
  await god.getByRole("button", { name: "Add 1 to Encounter" }).click();
  await god.getByText(/added directly to the Encounter.*No Character, NPC, or roster record was created\./).waitFor();
  const creatureOccurrencesAfter = await pool.query<{ character_id: number }>(
    "select character_id from campaign_session_encounter_participant where encounter_id=$1 and participant_kind='creature' order by character_id",
    [fixture.encounterId],
  );
  assert.equal(creatureOccurrencesAfter.rows.length, creatureOccurrencesBefore.rows.length + 1);
  const existingOccurrenceKeys = new Set(creatureOccurrencesBefore.rows.map(({ character_id }) => character_id));
  const addedOccurrence = creatureOccurrencesAfter.rows.find(({ character_id }) => !existingOccurrenceKeys.has(character_id));
  assert.ok(addedOccurrence && addedOccurrence.character_id < 0);
  assert.equal((await pool.query("select id from campaign_character where campaign_id=$1 and id=$2", [fixture.campaignId, addedOccurrence.character_id])).rowCount, 0);
  assert.equal((await pool.query("select character_id from campaign_character_active_health where character_id=$1", [addedOccurrence.character_id])).rowCount, 0);
  assert.equal((await pool.query("select character_id from campaign_character_item where character_id=$1", [addedOccurrence.character_id])).rowCount, 0);
  await god.getByRole("button", { name: /^Declarations/ }).click();
  const godPanel = god.getByRole("region", { name: "Ruling requests" });
  const calledShotRequest = godPanel.getByRole("article").filter({ hasText: "Disable the Tide Maw's grasping limb." });
  await calledShotRequest.getByLabel("Response / reason").fill("Approved for this exact firearm, target, objective, and location.");
  await calledShotRequest.getByLabel("Called Shot penalty").fill("4");
  await calledShotRequest.getByLabel("Penalty reason").fill("The requested limb is a smaller authored target location.");
  await calledShotRequest.getByRole("button", { name: "Save ruling" }).click();
  await eventually(async () => /Called Shot · Approved/.test(await requestPanel.innerText()), "The approved Called Shot did not reach the Player console.");

  await firearmCard.getByLabel("Target").selectOption({ label: "Another Player Character" });
  await firearmCard.getByLabel("Aim Initiative").fill("1");
  await firearmCard.getByLabel("Firing duration").fill("1");
  const calledShotOption = firearmCard.getByLabel("Approved Called Shot").locator("option").filter({ hasText: "Disable the Tide Maw's grasping limb" });
  const calledShotValue = await calledShotOption.getAttribute("value");
  assert.ok(calledShotValue);
  await firearmCard.getByLabel("Approved Called Shot").selectOption(calledShotValue);
  await firearmCard.getByRole("button", { name: "Declare attack" }).click();
  await firearmPanel.getByText("Firearm attack locked and committed.", { exact: true }).waitFor();
  await god.getByRole("button", { name: /^Initiative Tracker/ }).click();
  const godInitiative = god.getByRole("region", { name: "Initiative Tracker" });
  await godInitiative.getByRole("button", { name: "Advance to Next Event" }).click();
  await god.getByRole("button", { name: /^Declarations/ }).click();
  await eventually(async () => await firearmPanel.getByRole("button", { name: "Commit trigger" }).count() === 1, "The aimed firearm action did not become trigger-ready after authoritative advancement.");
  await firearmPanel.getByRole("button", { name: "Commit trigger" }).click();
  await firearmPanel.getByText("Trigger pull committed.", { exact: true }).waitFor();
  await responsePanel.getByRole("button", { name: "No Defense" }).click();
  await responsePanel.getByText("No Defense recorded.", { exact: true }).waitFor();
  await god.getByRole("button", { name: /^Initiative Tracker/ }).click();
  await godInitiative.getByRole("button", { name: "Advance to Next Event" }).click();
  await god.getByRole("button", { name: /^Declarations/ }).click();
  await eventually(async () => await firearmPanel.getByRole("button", { name: "Enter physical Roll" }).count() === 1, "The firearm Roll did not open after its response window reconciled.");
  await firearmPanel.getByLabel("Physical firearm Roll").fill("1");
  await firearmPanel.getByRole("button", { name: "Enter physical Roll" }).click();
  await firearmPanel.getByText(/Roll 1 · Failure/).waitFor();
  assert.match(await firearmPanel.innerText(), /critical/i);
  assert.match(await firearmPanel.innerText(), /Effect plan:/);
  const firearmProof = await pool.query<{ rounds: number; attacks: number; plans: number }>(`select
    (select loaded_rounds from campaign_character_firearm_state where item_instance_id=$2)::int as rounds,
    (select count(*) from campaign_session_encounter_firearm_attack where campaign_id=$1)::int as attacks,
    (select count(*) from campaign_session_encounter_effect_plan where campaign_id=$1)::int as plans`, [fixture.campaignId, fixture.firearmInstanceId]);
  assert.deepEqual(firearmProof.rows, [{ rounds: 2, attacks: 1, plans: 1 }]);

  await requestPanel.getByLabel("Request type").selectOption("intervention");
  await requestPanel.getByLabel("Intended target").selectOption({ label: "Tide Maw" });
  await requestPanel.getByLabel("Your intent").fill("Pull the Tide Maw away from the floodgate.");
  await requestPanel.getByRole("button", { name: "Submit request" }).click();
  await requestPanel.getByText("Ruling request sent.", { exact: true }).waitFor();
  await requestPanel.getByText(/Intervention · Pending/).waitFor();

  const storedRows = await pool.query<{ id: number; target_participant_id: number; status: string }>(
    "select id,target_participant_id,status from campaign_session_player_ruling_request where encounter_id=$1 and character_id=$2 and request_type='intervention'",
    [fixture.encounterId, fixture.playerCharacterId],
  );
  assert.equal(storedRows.rows.length, 1);
  const stored = storedRows.rows[0]!;
  assert.equal(stored.target_participant_id, -1);
  assert.equal(stored.status, "pending");

  await godPanel.getByText("Pull the Tide Maw away from the floodgate.", { exact: true }).waitFor();
  assert.match(await godPanel.innerText(), /Target: Tide Maw/);
  const interventionRequest = godPanel.getByRole("article").filter({ hasText: "Pull the Tide Maw away from the floodgate." });
  await interventionRequest.getByLabel("Response / reason").fill("Approved for this exact target and timing.");
  await interventionRequest.getByLabel("Structured ruling note, if approved").fill("Floodgate position confirmed.");
  await interventionRequest.getByRole("button", { name: "Save ruling" }).click();
  await godPanel.getByText(new RegExp(`Request #${stored.id} updated\\.`)).waitFor();

  await eventually(async () => /Intervention · Approved/.test(await requestPanel.innerText()), "The Player did not receive the G.O.D. ruling through live refresh.");
  assert.match(await requestPanel.innerText(), /Approved for this exact target and timing/);
  await player.reload();
  await player.getByText(/Intervention · Approved/).waitFor();
  assert.match(await requestPanel.innerText(), /Floodgate position confirmed/);

  for (const request of [
    { type: "ally-defense", label: "Ally Defense", target: "Another Player Character", intent: "Ask the other Player to cover the floodgate." },
    { type: "tackle", label: "Tackle", target: "Tide Maw", intent: "Tackle the Tide Maw before it reaches the floodgate." },
  ] as const) {
    await requestPanel.getByLabel("Request type").selectOption(request.type);
    await requestPanel.getByLabel("Intended target").selectOption({ label: request.target });
    await requestPanel.getByLabel("Your intent").fill(request.intent);
    await requestPanel.getByRole("button", { name: "Submit request" }).click();
    const playerRequest = requestPanel.getByRole("article").filter({ hasText: request.intent });
    await playerRequest.getByText(new RegExp(`${request.label} · Pending`)).waitFor();
    const godRequest = godPanel.getByRole("article").filter({ hasText: request.intent });
    await godRequest.getByLabel("Response / reason").fill(`Approved ${request.label.toLowerCase()} request.`);
    await godRequest.getByLabel("Structured ruling note, if approved").fill("Exact participant and timing confirmed.");
    await godRequest.getByRole("button", { name: "Save ruling" }).click();
    await eventually(async () => new RegExp(`${request.label} · Approved`).test(await playerRequest.innerText()), `${request.label} approval did not reach the Player console.`);
  }

  const itemIntent = player.getByRole("region", { name: "Items & equipment" }).getByPlaceholder("How do you want to use Browser Exact Cartridge?");
  const itemForm = itemIntent.locator("xpath=ancestor::form");
  await itemIntent.fill("Use an exact cartridge as an improvised signal marker.");
  await itemForm.getByRole("button", { name: "Request combat use" }).click();
  const itemRequest = requestPanel.getByRole("article").filter({ hasText: "Use an exact cartridge as an improvised signal marker." });
  await itemRequest.getByText(/Manual Action · Pending/).waitFor();
  const godItemRequest = godPanel.getByRole("article").filter({ hasText: "Use an exact cartridge as an improvised signal marker." });
  await godItemRequest.getByLabel("Response / reason").fill("Approved exact owned Item request.");
  await godItemRequest.getByLabel("Structured ruling note, if approved").fill("Item timing remains G.O.D.-governed.");
  await godItemRequest.getByRole("button", { name: "Save ruling" }).click();
  await eventually(async () => /Manual Action · Approved/.test(await itemRequest.innerText()), "The exact Item request approval did not reach the Player console.");

  await player.setViewportSize({ width: 390, height: 844 });
  await player.reload();
  assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await player.keyboard.press("Tab");
  assert.notEqual(await player.evaluate(() => document.activeElement?.tagName), "BODY");
  const submitBox = await requestPanel.getByRole("button", { name: "Submit request" }).boundingBox();
  assert.ok(submitBox && submitBox.height >= 44);

  await player.goto(`${BASE_URL}/realms/characters/${fixture.playerCharacterId}/encounter`);
  await player.waitForURL(`${BASE_URL}/realms/tabletop?character=${fixture.playerCharacterId}`);
  await player.getByRole("heading", { name: /^Round \d+ · Step \d+$/ }).waitFor();

  await player.goto(`${BASE_URL}/realms/tabletop?character=${fixture.targetCharacterId}`);
  await player.getByRole("heading", { name: "Choose your Character" }).waitFor();
  await player.getByText("That Character is unavailable. Choose one of your assigned Characters.").waitFor();

  await player.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}`);
  assert.equal(await player.getByRole("region", { name: "Ruling requests" }).count(), 0);
}

async function main(): Promise<void> {
  const distPath = resolve(process.cwd(), DIST_DIRECTORY);
  if (dirname(distPath) !== resolve(process.cwd()) || basename(distPath) !== DIST_DIRECTORY) throw new Error("The isolated Pass 13 browser build directory is unsafe.");
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  const pool = new pg.Pool({ connectionString });
  let fixture: Fixture | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await cleanupStaleFixtures(pool);
    fixture = await seedFixture(pool);
    await rm(distPath, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: { ...process.env, BETTER_AUTH_URL: BASE_URL, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: DIST_DIRECTORY },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const playerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const targetPlayerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const godContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const player = await login(playerContext, fixture.playerEmail);
    const targetPlayer = await login(targetPlayerContext, fixture.targetPlayerEmail);
    const god = await login(godContext, fixture.godEmail);
    await runWorkflow(player, targetPlayer, god, fixture, pool);
    console.log(JSON.stringify({
      pass: 13,
      workflows: ["exact weapon governance", "locked Player weapon declaration", "independent Player No Defense", "Dodge", "Parry cost and refund", "website and physical bound Rolls", "Player firearm reload", "Aim", "G.O.D.-approved Called Shot", "firearm attack and exact ammunition consumption", "critical ruling state", "Player direct-Creature intent", "two isolated direct-Creature occurrences", "G.O.D. Creature Catalog direct add", "persistent NPC identity", "ally-defense request and ruling", "Tackle request and ruling", "exact Item request and ruling", "G.O.D. ruling", "live refresh", "reload recovery", "responsive and keyboard Player console", "legacy route consolidation", "unauthorized Character denial", "Player G.O.D. denial"],
    }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(resolveStop, 2_000);
        server!.once("exit", () => { clearTimeout(timeout); resolveStop(); });
      });
    }
    await cleanupFixture(pool, fixture).catch((error) => console.error(error));
    await pool.end();
    await rm(distPath, { recursive: true, force: true });
    await writeFile(tsconfigPath, tsconfigBefore);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
