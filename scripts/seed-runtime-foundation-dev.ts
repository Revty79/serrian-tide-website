import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";

import type { MechanicalEffect } from "../src/features/mechanical-effects";
import type { SpellDocument } from "../src/features/spell-construction/models/spell";
import {
  createContainer,
  createEmptySpell,
  withCalculationSnapshot,
} from "../src/features/spell-construction/utilities/spellFactory";

dotenv.config({ path: ".env.local", quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured.");
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  throw new Error(`Refusing development fixture creation against non-local host ${url.hostname}.`);
}
if (!url.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing development fixture creation in ${url.pathname.slice(1)}.`);
}

const GOD_ID = "step13-god";
const PLAYER_ID = "step13-player";
const CAMPAIGN_NAME = "Runtime Foundation Local Review";
const DEV_PASSWORD = "Step13-Local-Only!";

type Queryable = Pick<pg.PoolClient, "query">;

async function one<T extends pg.QueryResultRow>(
  client: Queryable,
  text: string,
  values: unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0];
}

function buildSpell(
  id: string,
  name: string,
  frameworkSkillId: number,
  sphere: string,
  effects: Array<{
    ruleId: string;
    quantity: number;
    healingScope?: "full-body" | "area";
  }>,
): SpellDocument {
  const spell = createEmptySpell();
  const selections = effects.map((effect, index) => ({
    id: `${id}-effect-${index + 1}`,
    ruleId: effect.ruleId,
    quantity: effect.quantity,
    description: "",
    ...(effect.healingScope ? { healingScope: effect.healingScope } : {}),
  }));
  const target = createContainer("target");
  target.id = `${id}-target`;
  target.rangeRuleId = "short";
  target.effects = selections.filter(({ ruleId }) => ruleId !== "knockdown");
  const control = createContainer("control");
  control.id = `${id}-control`;
  control.effects = selections.filter(({ ruleId }) => ruleId === "knockdown");
  return withCalculationSnapshot({
    ...spell,
    id,
    name,
    castingSystem: "Spellcraft",
    frameworkSkillId,
    sphere,
    containers: [
      ...(target.effects.length ? [target] : []),
      ...(control.effects.length ? [control] : []),
    ],
    description: "Step 13 local Runtime Foundation review fixture.",
  });
}

function buildAoeDamageSpell(
  id: string,
  name: string,
  frameworkSkillId: number,
  sphere: string,
): SpellDocument {
  const spell = buildSpell(id, name, frameworkSkillId, sphere, [
    { ruleId: "damage", quantity: 2 },
  ]);
  const area = createContainer("aoe");
  area.id = `${id}-area`;
  area.rangeRuleId = "short";
  area.shape = { id: `${id}-radius`, ruleId: "radius", quantity: 1, description: "" };
  area.effects = spell.containers[0]!.effects;
  return withCalculationSnapshot({ ...spell, containers: [area] });
}

async function insertItem(
  client: Queryable,
  input: {
    canonicalId: string;
    name: string;
    scope: "equipment" | "inventory";
    group: "weapon" | "armor" | "general" | null;
    magical?: boolean;
  },
): Promise<number> {
  const row = await one<{ id: number }>(client, `
    insert into items (
      canonical_id, name, catalog_scope, equipment_group, record_type,
      family, category, description, price_basis, is_magical,
      created_by_user_id, source_system, source_external_id
    ) values ($1,$2,$3,$4,'development-fixture','Step 13','Runtime Review',
      'Local-only Runtime Foundation walkthrough fixture.','each',$5,$6,'step13-local',$1)
    returning id
  `, [input.canonicalId, input.name, input.scope, input.group, input.magical ?? false, GOD_ID]);
  return row.id;
}

async function insertItemEffects(
  client: Queryable,
  itemId: number,
  effects: MechanicalEffect[],
): Promise<void> {
  for (const [sortOrder, effect] of effects.entries()) {
    await client.query(
      "insert into item_effects (item_id,schema_version,effect_json,sort_order) values ($1,2,$2::jsonb,$3)",
      [itemId, JSON.stringify(effect), sortOrder],
    );
  }
}

async function main() {
const pool = new pg.Pool({ connectionString });
const client = await pool.connect();

try {
  const identity = await client.query(
    "select inet_server_addr()::text as address, inet_server_port() as port, current_database() as database",
  );
  if (!["127.0.0.1/32", "::1/128"].includes(identity.rows[0].address)) {
    throw new Error(`Refusing non-loopback PostgreSQL server ${identity.rows[0].address}.`);
  }

  await client.query("begin");
  try {
    await client.query("delete from campaign where name=$1", [CAMPAIGN_NAME]);
    await client.query("delete from items where source_system='step13-local'");
    await client.query("delete from creatures where source_system='step13-local'");
    await client.query("delete from \"user\" where id = any($1::text[])", [[GOD_ID, PLAYER_ID]]);

    const password = await hashPassword(DEV_PASSWORD);
    const users = [
      { id: GOD_ID, name: "Step 13 G.O.D.", email: "god.step13@local.test", username: "step13god" },
      { id: PLAYER_ID, name: "Step 13 Player", email: "player.step13@local.test", username: "step13player" },
    ];
    for (const user of users) {
      await client.query(`
        insert into "user" (id,name,email,email_verified,username,display_username)
        values ($1,$2,$3,true,$4,$4)
      `, [user.id, user.name, user.email, user.username]);
      await client.query(`
        insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
        values ($1,'local:credential',$2,'credential',$2,$3,now())
      `, [`${user.id}-credential`, user.id, password]);
    }
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player')", [GOD_ID, PLAYER_ID]);

    const campaign = await one<{ id: number }>(client, `
      insert into campaign (
        name,attribute_points,skill_points,max_starting_skill,
        points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
        currency_system,fate_point_method,assigned_fate_points,created_by_user_id
      ) values ($1,150,120,20,10,40,1000,'Credits','Assigned',3,$2)
      returning id
    `, [CAMPAIGN_NAME, GOD_ID]);
    await client.query(`
      insert into campaign_player (campaign_id,user_id,is_npc_controller)
      values ($1,$2,true),($1,$3,false)
    `, [campaign.id, GOD_ID, PLAYER_ID]);
    const systems = ["Tier 1", "Tier 2", "Tier 3", "Spellcraft", "Faith", "Special Abilities"];
    for (const [sortOrder, system] of systems.entries()) {
      await client.query(
        "insert into campaign_allowed_system (campaign_id,system,sort_order) values ($1,$2,$3)",
        [campaign.id, system, sortOrder],
      );
    }

    const race = await one<{ id: number }>(client, "select id from races where name='Educated Human'");
    await client.query(
      "insert into campaign_allowed_race (campaign_id,race_id,sort_order) values ($1,$2,0)",
      [campaign.id, race.id],
    );

    const ordinaryItemId = await insertItem(client, {
      canonicalId: "DEV-STEP13-STACK",
      name: "Runtime Review Supply",
      scope: "inventory",
      group: null,
    });
    const consumableItemId = await insertItem(client, {
      canonicalId: "DEV-STEP13-HEAL",
      name: "Runtime Review Healing Draught",
      scope: "inventory",
      group: null,
      magical: true,
    });
    const chargedItemId = await insertItem(client, {
      canonicalId: "DEV-STEP13-CHARGED",
      name: "Runtime Review Charged Wand",
      scope: "equipment",
      group: "weapon",
      magical: true,
    });
    const armorItemId = await insertItem(client, {
      canonicalId: "DEV-STEP13-ARMOR",
      name: "Runtime Review Ward Armor",
      scope: "equipment",
      group: "armor",
      magical: true,
    });
    const manualItemId = await insertItem(client, {
      canonicalId: "DEV-STEP13-MANUAL",
      name: "Runtime Review Manual Token",
      scope: "inventory",
      group: null,
      magical: true,
    });
    const mixedItemId = await insertItem(client, {
      canonicalId: "DEV-STEP13-MIXED",
      name: "Runtime Review Mixed Relic",
      scope: "inventory",
      group: null,
      magical: true,
    });

    await client.query(`
      insert into item_runtime_profiles
        (item_id,use_mode,quantity_per_use,maximum_charges,charges_per_use,recharge_notes,activation_label,use_notes)
      values
        ($1,'none',null,null,null,'','Use','Ordinary stack Item.'),
        ($2,'consume-item',1,null,null,'','Drink','Full Body Healing fixture.'),
        ($3,'charges',null,5,1,'Restore manually during local review.','Discharge','Charged-instance fixture.'),
        ($4,'none',null,null,null,'','Use','Passive Equipment fixture.'),
        ($5,'consume-item',1,null,null,'','Invoke','Manual-only Item fixture.'),
        ($6,'unlimited',null,null,null,'','Invoke','Mixed automatic and Manual fixture.')
    `, [ordinaryItemId, consumableItemId, chargedItemId, armorItemId, manualItemId, mixedItemId]);
    await insertItemEffects(client, consumableItemId, [
      { kind: "health.heal", amount: 3, scope: "full-body" },
    ]);
    await insertItemEffects(client, chargedItemId, [
      { kind: "health.damage", amount: 2, application: "localized" },
    ]);
    await insertItemEffects(client, manualItemId, [
      { kind: "manual", title: "Choose a narrative boon", description: "The G.O.D. resolves the boon at the table." },
    ]);
    await insertItemEffects(client, mixedItemId, [
      { kind: "health.heal", amount: 1, scope: "area" },
      { kind: "manual", title: "Radiant aftereffect", description: "Resolve the visible narrative aftereffect manually." },
    ]);
    await client.query(`
      insert into weapon_profiles
        (item_id,profile_record_type,weapon_type,handedness,damage_source,damage,initiative_cost,damage_type,range_text,rules_text)
      values ($1,'development-fixture','Wand','One-Handed','None','2',4,'Arcane','Short','Local Runtime Foundation weapon context.')
    `, [chargedItemId]);
    await client.query(`
      insert into armor_profiles
        (item_id,armor_type,coverage,base_soak,damage_modifiers_source_text,rules_text)
      values ($1,'Ward','Body',2,'','Local Runtime Foundation armor context.')
    `, [armorItemId]);
    await client.query(`
      insert into item_passive_effects
        (item_id,required_equipment_state,schema_version,effect_json,sort_order)
      values ($1,'worn',2,$2::jsonb,0),($1,'worn',2,$3::jsonb,1)
    `, [
      armorItemId,
      JSON.stringify({ kind: "modifier.apply", label: "Ward Armor Soak", channel: "soak", targetKey: "self", amount: 2, duration: { kind: "until-removed", value: null } }),
      JSON.stringify({ kind: "condition.apply", name: "Ward Armor Active", description: "The local review armor is currently worn.", duration: { kind: "until-removed", value: null } }),
    ]);
    const campaignItems = [ordinaryItemId, consumableItemId, chargedItemId, armorItemId, manualItemId, mixedItemId];
    for (const [sortOrder, itemId] of campaignItems.entries()) {
      await client.query(
        "insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,$3)",
        [campaign.id, itemId, sortOrder],
      );
    }

    const playerCharacter = await one<{ id: number }>(client, `
      insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind)
      values ($1,$2,'Mara Tidewright',false,'race') returning id
    `, [campaign.id, PLAYER_ID]);
    const raceNpc = await one<{ id: number }>(client, `
      insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind)
      values ($1,$2,'Archivist Rowan',true,'race') returning id
    `, [campaign.id, GOD_ID]);

    const challenge = await one<{ xp: number }>(client, "select kill_xp as xp from challenge_rating_reference where challenge_rating=1");
    const creature = await one<{ id: number }>(client, `
      insert into creatures (
        canonical_id,canonical_name,family,creature_type,size,challenge_rating,kill_xp,
        description,created_by_user_id,source_system,calculated_challenge_rating
      ) values ('DEV-STEP13-CREATURE','Runtime Review Beast','Development','Runtime Fixture','Medium',1,$1,
        'Local-only Creature Ability and anatomy fixture.',$2,'step13-local',1)
      returning id
    `, [challenge.xp, GOD_ID]);
    const structuredAbility = await one<{ id: number }>(client, `
      insert into creature_abilities (
        canonical_id,creature_id,ability_name,ability_type,activation,description,mechanical_effect,sort_order,cr_impact
      ) values ('DEV-STEP13-STRUCTURED-ABILITY',$1,'Tidal Slam','Active','Action',
        'A structured local test Ability.','',0,'None') returning id
    `, [creature.id]);
    await client.query(`
      insert into creature_ability_effects
        (ability_id,effect_key,schema_version,effect_json,sort_order)
      values ($1,'slam-damage',2,$2::jsonb,0),($1,'slam-condition',2,$3::jsonb,1)
    `, [
      structuredAbility.id,
      JSON.stringify({ kind: "health.damage", amount: 2, application: "localized" }),
      JSON.stringify({ kind: "condition.apply", name: "Drenched", description: "Marked by the structured Ability.", duration: { kind: "scene", value: null } }),
    ]);
    await client.query(`
      insert into creature_abilities (
        canonical_id,creature_id,ability_name,ability_type,activation,description,mechanical_effect,sort_order,cr_impact
      ) values ('DEV-STEP13-LEGACY-ABILITY',$1,'Unwritten Omen','Narrative','Passive',
        'A legacy Manual fallback fixture.','The G.O.D. decides what omen appears.',1,'None')
    `, [creature.id]);

    const structuredEffects = [
      { effectKey: "slam-damage", schemaVersion: 2, effect: { kind: "health.damage", amount: 2, application: "localized" }, sortOrder: 0 },
      { effectKey: "slam-condition", schemaVersion: 2, effect: { kind: "condition.apply", name: "Drenched", description: "Marked by the structured Ability.", duration: { kind: "scene", value: null } }, sortOrder: 1 },
    ];
    const creatureSnapshot = {
      id: creature.id,
      core: {
        canonicalId: "DEV-STEP13-CREATURE",
        canonicalName: "Runtime Review Beast",
        family: "Development",
        creatureType: "Runtime Fixture",
        size: "Medium",
        challengeRating: 1,
        killXp: challenge.xp,
        parentCreatureId: null,
        parentCreatureName: null,
        calculatedChallengeRating: 1,
        challengeRatingAdjustment: 0,
        challengeRatingAdjustmentReason: "",
        description: "Local-only Creature Ability and anatomy fixture.",
        typicalBehavior: "Used only for local Runtime Foundation review.",
        habitatEcology: "Development database.",
        notes: "",
        sourceSystem: "step13-local",
      },
      attributes: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((attributeKey, sortOrder) => ({ attributeKey, value: 25, notes: "", sortOrder })),
      movement: [{ movementMode: "Ground", movementValue: 8, initiative: 8, requirements: "", notes: "", sortOrder: 0 }],
      hpPools: [
        { canonicalId: "DEV-STEP13-BODY", poolName: "Body", hpPercentage: 80, notes: "", sortOrder: 0 },
        { canonicalId: "DEV-STEP13-TAIL", poolName: "Tail", hpPercentage: 20, notes: "", sortOrder: 1 },
      ],
      hitLocations: [
        { hitLocationNumber: 0, locationName: "Body", bodyPartsIncluded: "Body", hpPoolCanonicalId: "DEV-STEP13-BODY", naturalArmor: "", soak: "", locationEffect: "", notes: "", sortOrder: 0 },
        { hitLocationNumber: 9, locationName: "Tail", bodyPartsIncluded: "Tail", hpPoolCanonicalId: "DEV-STEP13-TAIL", naturalArmor: "", soak: "", locationEffect: "", notes: "", sortOrder: 1 },
      ],
      attacks: [],
      skillLinks: [],
      abilities: [
        { canonicalId: "DEV-STEP13-STRUCTURED-ABILITY", abilityName: "Tidal Slam", abilityType: "Active", activation: "Action", requirements: "", usesRecharge: "", description: "A structured local test Ability.", mechanicalEffect: "", notes: "", sortOrder: 0, crImpact: "None", effects: structuredEffects },
        { canonicalId: "DEV-STEP13-LEGACY-ABILITY", abilityName: "Unwritten Omen", abilityType: "Narrative", activation: "Passive", requirements: "", usesRecharge: "", description: "A legacy Manual fallback fixture.", mechanicalEffect: "The G.O.D. decides what omen appears.", notes: "", sortOrder: 1, crImpact: "None", effects: [] },
      ],
      defenses: [],
      uses: [],
      derivedCreatures: [],
    };
    const creatureNpc = await one<{ id: number }>(client, `
      insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind)
      values ($1,$2,'Brine, the Review Beast',true,'creature') returning id
    `, [campaign.id, GOD_ID]);

    for (const character of [
      { id: playerCharacter.id, raceId: race.id, credits: 750 },
      { id: raceNpc.id, raceId: race.id, credits: 400 },
      { id: creatureNpc.id, raceId: null, credits: 0 },
    ]) {
      await client.query(`
        insert into campaign_character_profile
          (character_id,race_id,credits_remaining,fate_points,creation_completed_at)
        values ($1,$2,$3,3,now())
      `, [character.id, character.raceId, character.credits]);
      for (const attributeKey of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
        await client.query(
          "insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,25)",
          [character.id, attributeKey],
        );
      }
    }
    await client.query(`
      insert into campaign_creature_npc_profile
        (character_id,creature_id,personality,instance_notes,hp_adjustment,baseline_snapshot_json,current_snapshot_json)
      values ($1,$2,'Patient and observant.','Step 13 local fixture.',0,$3,$3)
    `, [creatureNpc.id, creature.id, JSON.stringify(creatureSnapshot)]);

    const skills = await client.query<{ id: number; name: string }>(
      "select id,name from skill where name = any($1::text[])",
      [["Spellcraft", "Channeling", "Faith", "Devotion", "Fire", "Life"]],
    );
    const skillByName = new Map(skills.rows.map((skill) => [skill.name, skill.id]));
    for (const name of ["Spellcraft", "Channeling", "Faith", "Devotion", "Fire", "Life"]) {
      if (!skillByName.has(name)) throw new Error(`Required imported Skill ${name} is missing.`);
    }
    const root = await one<{ id: number }>(client, `
      insert into campaign_character_skill_allocation (character_id,skill_id,points)
      values ($1,$2,1) returning id
    `, [playerCharacter.id, skillByName.get("Spellcraft")]);
    for (const [name, points] of [["Channeling", 10], ["Fire", 1], ["Life", 1]] as const) {
      await client.query(`
        insert into campaign_character_skill_allocation (character_id,skill_id,parent_allocation_id,points)
        values ($1,$2,$3,$4)
      `, [playerCharacter.id, skillByName.get(name), root.id, points]);
    }
    const faithRoot = await one<{ id: number }>(client, `
      insert into campaign_character_skill_allocation (character_id,skill_id,points)
      values ($1,$2,1) returning id
    `, [playerCharacter.id, skillByName.get("Faith")]);
    await client.query(`
      insert into campaign_character_skill_allocation (character_id,skill_id,parent_allocation_id,points)
      values ($1,$2,$3,6)
    `, [playerCharacter.id, skillByName.get("Devotion"), faithRoot.id]);

    const spells = [
      buildSpell("step13-damage", "Review Flame", skillByName.get("Fire")!, "Fire", [{ ruleId: "damage", quantity: 2 }]),
      buildSpell("step13-full-heal", "Review Renewal", skillByName.get("Life")!, "Life", [{ ruleId: "healing", quantity: 3, healingScope: "full-body" }]),
      buildSpell("step13-area-heal", "Review Mending", skillByName.get("Life")!, "Life", [{ ruleId: "healing", quantity: 2, healingScope: "area" }]),
      buildAoeDamageSpell("step13-aoe-damage", "Review Fire Burst", skillByName.get("Fire")!, "Fire"),
      buildSpell("step13-manual", "Review Knockdown", skillByName.get("Fire")!, "Fire", [{ ruleId: "knockdown", quantity: 1 }]),
      buildSpell("step13-mixed", "Review Flame Impact", skillByName.get("Fire")!, "Fire", [{ ruleId: "damage", quantity: 1 }, { ruleId: "knockdown", quantity: 1 }]),
    ];
    for (const spell of spells) {
      await client.query(`
        insert into campaign_character_spell_document
          (character_id,document_id,name,tradition,document_json,in_spellbook)
        values ($1,$2,$3,$4,$5,true)
      `, [playerCharacter.id, spell.id, spell.name, spell.tradition, JSON.stringify(spell)]);
    }

    const stackOwnership = [
      [ordinaryItemId, 3],
      [consumableItemId, 3],
      [armorItemId, 1],
      [manualItemId, 2],
      [mixedItemId, 1],
    ];
    for (const [itemId, quantity] of stackOwnership) {
      await client.query(`
        insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits)
        values ($1,$2,$3,12.5)
      `, [playerCharacter.id, itemId, quantity]);
    }
    await client.query(`
      insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity)
      values ($1,$2,'worn',1)
    `, [playerCharacter.id, armorItemId]);
    await client.query(`
      insert into campaign_character_item_instance
        (character_id,item_id,current_charges,equipment_state,unit_cost_credits)
      values ($1,$2,5,'wielded',20),($1,$2,2,'inactive',18)
    `, [playerCharacter.id, chargedItemId]);
    await client.query(`
      insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits)
      values ($1,$2,1,0)
    `, [raceNpc.id, armorItemId]);

    await client.query("commit");
    console.log(JSON.stringify({
      database: `${identity.rows[0].address}:${identity.rows[0].port}/${identity.rows[0].database}`,
      accounts: {
        god: { email: "god.step13@local.test", username: "step13god" },
        player: { email: "player.step13@local.test", username: "step13player" },
        password: DEV_PASSWORD,
      },
      campaignId: campaign.id,
      characters: { player: playerCharacter.id, raceNpc: raceNpc.id, creatureNpc: creatureNpc.id },
      runtimeItems: campaignItems.length,
      savedSpells: spells.length,
      creatureAbilities: 2,
    }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
} finally {
  client.release();
  await pool.end();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
