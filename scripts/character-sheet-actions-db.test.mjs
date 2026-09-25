import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_character_sheet_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Run the disposable character sheet harness.");
const ids = JSON.parse(process.env.SERRIAN_SHEET_FIXTURES);
const actors = new AsyncLocalStorage();
const roles = { "sheet-owner": ["god", "player"], "sheet-player": ["player"], "sheet-foreign": ["god", "player"], "sheet-admin": ["admin"] };
const session = async () => ({ user: { id: actors.getStore() } });
const context = async () => ({ session: await session(), roles: roles[actors.getStore()] });
const role = async (required) => { const value = await context(); if (!value.roles.includes(required)) throw new Error("Role required."); return value.session; };
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requirePlayer: () => role("player"), requireGod: () => role("god"), requireAdmin: () => role("admin"), requireRole: role,
  requireAccessContext: async (required) => { await role(required); return context(); },
  requireGodOrAdminAccessContext: async () => { const value = await context(); if (!value.roles.some(r => r === "god" || r === "admin")) throw new Error("Manager role required."); return value; },
  requireCampaignOwner: session, requireCampaignAccess: session,
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool, db } = await import("../src/db/index.ts");
const actions = await import("../src/app/characters/actions.ts");
const health = await import("../src/app/characters/active-health-actions.ts");
const mana = await import("../src/app/characters/active-mana-actions.ts");
const inventory = await import("../src/app/characters/owner-inventory-actions.ts");
const equipment = await import("../src/app/characters/equipment-state-actions.ts");
const paper = await import("../src/app/characters/paper-character-actions.ts");
const internalHealth = await import("../src/features/active-state/active-health-service.ts");
const internalMana = await import("../src/features/active-state/active-mana-service.ts");
const { characterAggregateToDraft } = await import("../src/features/characters/character-rules.ts");
const act = (user, operation) => actors.run(`sheet-${user}`, operation);
const trackingKeys = ["fame", "experience", "totalExperience", "quintessence", "totalQuintessence"];
const tracking = profile => Object.fromEntries(trackingKeys.map(key => [key, profile[key]]));
const totals = { fame: 7, experience: 123, totalExperience: 456, quintessence: 12, totalQuintessence: 34 };
const state = async id => (await pool.query("select h.total_damage,m.mana_spent from campaign_character_active_health h join campaign_character_active_mana m using(character_id) where character_id=$1", [id])).rows;
after(() => pool.end());

test("Paper playable spell costs and timing match the authoritative casting preview, preserving import metadata", async () => {
  const {createEmptySpell}=await import('../src/features/spell-construction/utilities/spellFactory.ts');
  const {prepareCharacterSpellCastInTransaction}=await import('../src/features/characters/character-spell-runtime-service.ts');
  const characterId=ids[0];
  const record=await act('player',()=>actions.getCharacter(characterId,false));
  const parent=record.skillAllocations.find(row=>row.skillName==='Spellcraft');
  const document=createEmptySpell(); document.name='Print calculation regression'; document.castingSystem='Spellcraft';
  document.containers[0].effects=[{id:'print-heal',ruleId:'healing',quantity:3,healingScope:'full-body'}];
  const documentJson=JSON.stringify(document);
  const skillId=(await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'spell',2,'INT','Print fixture') returning id",[document.name])).rows[0].id;
  let allocationId;
  try {
    await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'spell-construction',7,$2),($1,'spell-import-source',1,$3)",[skillId,documentJson,JSON.stringify({spreadsheetReference:{statedSpellCost:999,masteryLabel:'Apprentice'}})]);
    allocationId=(await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,parent_allocation_id,points) values($1,$2,$3,1) returning id',[characterId,skillId,parent.id])).rows[0].id;
    const request={casterCharacterId:characterId,source:{kind:'catalog',allocationId},selections:{targetGroups:{},applications:{}}};
    const preview=await db.transaction(tx=>prepareCharacterSpellCastInTransaction(tx,request,'sheet-player'),{accessMode:'read only'});
    const before=await state(characterId);
    const printed=await act('player',()=>paper.getPaperCharacterSheet(characterId));
    const spell=printed.spells.find(row=>row.key===`catalog:${allocationId}`);
    assert.equal(spell.catalogManaCost,999);
    assert.notEqual(spell.manaCost,999);
    assert.deepEqual([spell.manaCost,spell.combatCastingTime,spell.outOfCombatCastingTimeSeconds],[preview.plan.finalManaCost,preview.plan.finalInitiativeCost,preview.plan.finalOutOfCombatCastingTimeSeconds]);
    assert.equal((await pool.query("select data_json from skill_extension where skill_id=$1 and extension_type='spell-construction'",[skillId])).rows[0].data_json,documentJson);
    assert.deepEqual(await state(characterId),before);
  } finally {
    if(allocationId) await pool.query('delete from campaign_character_skill_allocation where id=$1',[allocationId]);
    await pool.query('delete from skill where id=$1',[skillId]);
  }
});

test("Paper uses current Psyonics and Bardic Resonance skills and resource names", async () => {
  const characterId=ids[0];
  const skillIds=[];
  try {
    for(const [name,classification] of [['Psionic Focus','magic access'],['Psionic Channeling','standard'],['Resonant Performance','magic access'],['Resonance Attunement','standard']]) {
      const skillId=(await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,$2,1,'INT','Disposable current-system print fixture') returning id",[name,classification])).rows[0].id;
      skillIds.push(skillId);
      await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,10)',[characterId,skillId]);
    }
    const printed=await act('player',()=>paper.getPaperCharacterSheet(characterId));
    for(const [name,system] of [['Psionic Focus','Psyonics'],['Resonant Performance','Bardic Resonance']]) {
      assert.equal(printed.skills.find(row=>row.name===name)?.system,system);
      assert.ok(printed.mana.some(pool=>pool.system===system && pool.maximumMana>0));
    }
    for(const name of ['Psionic Channeling','Resonance Attunement']) assert.ok(printed.skills.some(row=>row.name===name));
    assert.ok(!printed.skills.some(row=>['Mental','Physical','Kinetic'].includes(row.name)), 'Do not insert disciplines from the design image');
  } finally {
    await pool.query('delete from campaign_character_skill_allocation where character_id=$1 and skill_id=any($2::int[])',[characterId,skillIds]);
    await pool.query('delete from skill where id=any($1::int[])',[skillIds]);
  }
});

test("Paper Character Sheet reads saved runtime and public totals without changing any Character records", async () => {
  const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_')) order by table_name")).rows;
  const snapshot = async () => {
    const rows = [];
    for (const {table_name: table} of tables) {
      assert.match(table,/^campaign_character(?:_[a-z_]+)?$/);
      rows.push((await pool.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) value from "${table}" r`)).rows[0].value);
    }
    return rows;
  };
  const before = await snapshot();
  for (const [user, manager] of [["player",false],["owner",true],["admin",true]]) {
    const printed = await act(user, () => paper.getPaperCharacterSheet(ids[0],manager));
    const healthView = await act(user, () => health.getActiveHealth(ids[0]));
    const manaView = await act(user, () => mana.getActiveMana(ids[0]));
    assert.equal(printed.characterId,ids[0]);
    assert.equal(printed.health.total.remainingHp,healthView.total.remainingHp);
    assert.deepEqual(printed.mana,manaView.pools);
    assert.deepEqual(printed.totals.slice(0,5).map(row=>row.value),Object.values(totals));
    assert.ok(printed.inventory.some(row=>row.status.includes('2/5 charges')));
    assert.ok(printed.inventory.some(row=>row.status.includes('4/5 charges')));
    assert.doesNotMatch(JSON.stringify(printed),/updatedByUserId|operationHistory|overrideReason|resolutionNote|endNote/);
  }
  assert.deepEqual(await snapshot(),before);
});

test("Paper print action rejects another Character, unrelated G.O.D. and forged manager access", async () => {
  for (const [user, manager, id] of [["player",false,ids[2]],["foreign",false,ids[0]],["foreign",true,ids[0]],["player",true,ids[0]],["player",false,999999]]) {
    await assert.rejects(act(user,()=>paper.getPaperCharacterSheet(id,manager)));
  }
});

test("server-derived capability, readable totals, and forged routes/flags", async () => {
  for (const [user, manager, allowed] of [["owner",true,true],["player",false,false],["admin",true,false]]) {
    const record = await act(user, () => actions.getCharacter(ids[0],manager));
    assert.equal(record.sheetAccess.canAccessPrivateGod,allowed);
    assert.deepEqual(tracking(JSON.parse(JSON.stringify(record)).profile),totals);
    assert.deepEqual(tracking(characterAggregateToDraft(record).profile),totals);
  }
  for (const [user, manager, id] of [["player",true,ids[0]],["foreign",true,ids[0]],["foreign",false,ids[0]],["player",false,ids[2]],["player",false,999999]]) {
    await assert.rejects(act(user, () => actions.getCharacter(id,manager)));
  }
});

test("ordinary and admin saves preserve nonzero tracking, omissions preserve, forged changes reject", async () => {
  for (const user of ["player","admin"]) {
    const manager = user === "admin";
    let record = await act(user, () => actions.getCharacter(ids[1],manager));
    for (const key of trackingKeys) {
      const forged = characterAggregateToDraft(record); forged.profile[key] = 999; forged.sheetAccess = {canAccessPrivateGod:true}; forged.campaignId = ids[2];
      await assert.rejects(act(user, () => actions.saveCharacter(ids[1],forged,false,manager)), /Campaign creator/);
    }
    for (const omit of [false,true]) {
      const draft = characterAggregateToDraft(record);
      if (omit) for (const key of trackingKeys) delete draft.profile[key];
      const before = await state(ids[1]);
      record = await act(user, () => actions.saveCharacter(ids[1],draft,false,manager));
      assert.deepEqual(tracking(record.profile),totals);
      assert.deepEqual(await state(ids[1]),before,"Profile saves must not heal or refill");
    }
  }
});

test("creator adjustments, omitted values, creation validation and permanent player lock", async () => {
  let record = await act("owner", () => actions.getCharacter(ids[1],true));
  const ownerDraft = characterAggregateToDraft(record); ownerDraft.profile.fame = 8;
  for (const key of trackingKeys.filter(key => key !== "fame")) delete ownerDraft.profile[key];
  record = await act("owner", () => actions.saveCharacter(ids[1],ownerDraft,false,true));
  assert.deepEqual(tracking(record.profile),{...totals,fame:8});
  const excessive = characterAggregateToDraft(record); excessive.attributes.STR = 999;
  await assert.rejects(act("player", () => actions.saveCharacter(ids[1],excessive,false,false)), /budget/);
  const incomplete = characterAggregateToDraft(record); incomplete.profile.goals = "";
  await assert.rejects(act("player", () => actions.saveCharacter(ids[1],incomplete,true,false)), /Story/);
  record = await act("player", () => actions.saveCharacter(ids[1],characterAggregateToDraft(record),true,false));
  assert.ok(record.profile.creationCompletedAt);
  await assert.rejects(act("player", () => actions.saveCharacter(ids[1],characterAggregateToDraft(record),false,false)), /permanently locked/);
});

test("every manual restore rejects player, unrelated G.O.D., and foreign admin", async () => {
  for (const user of ["player","foreign","admin"]) {
    const before = await state(ids[0]);
    for (const operation of [() => health.restoreAllHealthAction(ids[0],true),() => health.healFullBodyAction(ids[0],1),() => health.healAreaAction(ids[0],"head",1),() => health.resolveInjuryAction(ids[0],1),() => mana.restoreAllManaAction(ids[0],true),() => mana.restoreManaPoolAction({characterId:ids[0],system:"Spellcraft"}),() => mana.restoreManaAction({characterId:ids[0],system:"Spellcraft",amount:1})]) {
      await assert.rejects(act(user,operation),/permission/);
    }
    assert.deepEqual(await state(ids[0]),before);
  }
});

test("creator restores completed resources with confirmations; trusted gameplay operations remain available", async () => {
  await assert.rejects(act("owner", () => health.restoreAllHealthAction(ids[0],false)), /confirmation/);
  await assert.rejects(act("owner", () => mana.restoreAllManaAction(ids[0],false)), /confirmation/);
  await assert.rejects(act("owner", () => mana.restoreManaAction({characterId:ids[0],system:"Spellcraft",amount:-1})), /positive/);
  const before = await act("player", () => actions.getCharacter(ids[0],false));
  await act("owner", () => health.restoreAllHealthAction(ids[0],true));
  await act("owner", () => mana.restoreAllManaAction(ids[0],true));
  assert.deepEqual(await state(ids[0]),[{total_damage:0,mana_spent:0}]);
  const afterRecord = await act("player", () => actions.getCharacter(ids[0],false));
  assert.deepEqual(afterRecord.profile,before.profile); assert.deepEqual(afterRecord.attributes,before.attributes);
  await act("player", () => mana.spendManaAction({characterId:ids[0],system:"Spellcraft",amount:4}));
  await db.transaction(async tx => {
    await internalHealth.damageFullBodyInTransaction(tx,ids[0],"race",5);
    await internalHealth.healFullBodyInTransaction(tx,ids[0],"race",2);
    await internalMana.restoreActiveManaInTransaction(tx,{characterId:ids[0],system:"Spellcraft",amount:2});
  });
  assert.deepEqual(await state(ids[0]),[{total_damage:3,mana_spent:2}]);
});

test("player advancement still purchases Skills and Quintessence benefits with authoritative costs and eligibility", async () => {
  const record = await act("player", () => actions.getCharacter(ids[0],false));
  const channeling = record.skillCatalog.find(skill => skill.name === "Channeling");
  const beforeState = await state(ids[0]);
  const advanced = await act("player", () => actions.advanceCharacterSkill(ids[0],channeling.id,null,1));
  assert.equal(advanced.skillAllocations.find(row => row.skillId === channeling.id).points,11);
  assert.equal(advanced.profile.experience,113);
  assert.equal(advanced.profile.totalExperience,466);
  const spent = await act("player", () => actions.spendCharacterQuintessence(ids[0],"fatePoints",1));
  assert.equal(spent.profile.fatePoints,record.profile.fatePoints+1);
  assert.equal(spent.profile.quintessence,2);
  assert.equal(spent.profile.totalQuintessence,44);
  for (const operation of [() => actions.advanceCharacterSkill(ids[0],channeling.id,null,80), () => actions.spendCharacterQuintessence(ids[0],"fatePoints",100)]) {
    await assert.rejects(act("player",operation), /enough|afford|Experience|Quintessence/);
  }
  await assert.rejects(act("foreign", () => actions.advanceCharacterSkill(ids[0],channeling.id,null,1)), /own Character/);
  await assert.rejects(act("foreign", () => actions.spendCharacterQuintessence(ids[0],"fatePoints",1)), /own Character/);
  const latest = await act("player", () => actions.getCharacter(ids[0],false));
  assert.deepEqual(latest.profile,spent.profile,"Rejected purchases must make no balance changes");
  assert.deepEqual(await state(ids[0]),beforeState,"Advancement must not heal or refill");
});

test("inline equipment selector preserves ownership, bounds, stale-state protection and live permissions", async () => {
  const view = await act("player", () => equipment.getCharacterEquipmentState(ids[0]));
  const armor = view.stacks.find(item => item.itemName === "Leather Armor");
  const command = { characterId: ids[0], itemId: armor.itemId, state: "worn", quantity: 2, expectedQuantities: {inactive:3,equipped:0,worn:0,wielded:0} };
  const before = (await pool.query("select * from campaign_character_item where character_id=$1 order by item_id",[ids[0]])).rows;
  for (const actor of ["foreign","admin"]) await assert.rejects(act(actor, () => equipment.setStackEquipmentRoleAction(command)), /permission/);
  for (const quantity of [-1,4,1.5]) await assert.rejects(act("player", () => equipment.setStackEquipmentRoleAction({...command,quantity})), /quantity/);
  await assert.rejects(act("player", () => equipment.setStackEquipmentRoleAction({...command,characterId:ids[2]})), /permission/);
  const changed = await act("player", () => equipment.setStackEquipmentRoleAction(command));
  const stored = changed.equipmentState.stacks.find(item => item.itemId === armor.itemId);
  assert.equal(stored.wornQuantity,2); assert.equal(stored.inactiveQuantity,1); assert.equal(stored.ownedQuantity,3);
  await assert.rejects(act("player", () => equipment.setStackEquipmentRoleAction(command)), /Equipment changed/);
  const cleared = await act("player", () => equipment.setStackEquipmentRoleAction({...command,state:"inactive",quantity:0,expectedQuantities:{inactive:1,equipped:0,worn:2,wielded:0}}));
  assert.equal(cleared.equipmentState.stacks.find(item => item.itemId === armor.itemId).inactiveQuantity,3);
  assert.deepEqual((await pool.query("select * from campaign_character_item where character_id=$1 order by item_id",[ids[0]])).rows,before);
});


test("owner grants/removals preserve costs and copies, reject retries/forgeries, clean active effects and retain unavailable ownership", async () => {
  const characterId = ids[2];
  let before = await act("owner", () => actions.getCharacter(characterId,true));
  const campaignId = before.character.campaignId;
  for (const actor of ["owner","admin"]) {
    const changed=characterAggregateToDraft(before); changed.items[0].quantity+=1;
    await assert.rejects(act(actor,()=>actions.saveCharacter(characterId,changed,false,true)),/owner Add Item/);
  }
  const saved=await act("owner",()=>actions.saveCharacter(characterId,characterAggregateToDraft(before),false,true));
  assert.deepEqual(saved.items,before.items,"Ordinary profile saves preserve acquisition records");
  before=saved;

  const createItem = async (suffix,scope="equipment") => (await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,credits) values($1,$2,$3,$4,'Item','Test','Test','unit',null) returning id",[`OWNER-${suffix.toUpperCase()}`,`Owner ${suffix}`,scope,scope==="equipment"?"general":null])).rows[0].id;
  const stackId = await createItem("Token"), copyId = await createItem("Charged"), unavailableId = await createItem("Unavailable");
  await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,100),($1,$3,101)",[campaignId,stackId,copyId]);
  await pool.query("insert into item_power_resources(item_id,maximum_charges) values($1,7)",[copyId]);
  for (const itemId of [stackId,copyId]) await pool.query("insert into item_passive_effects(item_id,required_equipment_state,schema_version,effect_json,sort_order) values($1,'equipped',2,$2,0)",[itemId,JSON.stringify({kind:"modifier.apply",label:"Owner fixture bonus",channel:"attribute",targetKey:"STR",amount:2,duration:{kind:"until-removed"}})]);
  const version = async () => (await pool.query("select commerce_version from campaign_character_profile where character_id=$1",[characterId])).rows[0].commerce_version;
  const command = async (itemId,extra={}) => ({characterId,itemId,quantity:1,operation:"grant",expectedCommerceVersion:await version(),...extra});
  const run = input => act("owner", () => inventory.adjustOwnerInventoryAction(input));
  const listing = await act("owner", () => inventory.getOwnerGrantItemsAction(characterId));
  assert.ok(listing.some(row => row.id===stackId)); assert.ok(!listing.some(row => row.id===unavailableId));
  for (const actor of ["player","foreign","admin"]) {
    for (const target of ids) {
      await assert.rejects(act(actor,()=>inventory.getOwnerGrantItemsAction(target)), /campaign creator/);
      for (const operation of ["grant","remove"]) await assert.rejects(act(actor,()=>inventory.adjustOwnerInventoryAction({characterId:target,itemId:stackId,quantity:1,operation,instanceId:null,state:"inactive",expectedCommerceVersion:0,godMode:true})),/campaign creator/);
    }
  }
  await assert.rejects(run(await command(unavailableId)),/not currently available/);
  for (const quantity of [0,-1,1.5,1001]) await assert.rejects(run(await command(stackId,{quantity})),/quantity|1,000/);
  const initial = await command(stackId,{quantity:3});
  const concurrent = await Promise.allSettled([run(initial),run(initial)]);
  assert.equal(concurrent.filter(result => result.status==="fulfilled").length,1);
  assert.equal(concurrent.filter(result => result.status==="rejected").length,1);
  await assert.rejects(run(initial),/already completed/);
  await pool.query("update campaign_character_item set unit_cost_credits=10 where character_id=$1 and item_id=$2",[characterId,stackId]);
  await run(await command(stackId,{quantity:2}));
  const owned = (await pool.query("select * from campaign_character_item where character_id=$1 and item_id=$2",[characterId,stackId])).rows[0];
  assert.equal(owned.quantity,5); assert.equal(owned.quantity*owned.unit_cost_credits,30,"Free grants preserve total historical acquisition cost");
  await run(await command(copyId,{quantity:2}));
  const copies = (await pool.query("select * from campaign_character_item_instance where character_id=$1 and item_id=$2 order by id",[characterId,copyId])).rows;
  assert.deepEqual(copies.map(row=>[row.current_charges,row.equipment_state,row.loaded_rounds,row.loaded_ammunition_item_id,row.unit_cost_credits]),[[7,"inactive",0,null,0],[7,"inactive",0,null,0]]);
  const active = async () => (await pool.query("select * from campaign_character_active_modifier where character_id=$1 and source_kind='item' and source_id in ($2,$3) and ended_at is null",[characterId,String(stackId),String(copyId)])).rows;
  assert.equal((await active()).length,0,"Grant must not activate bonuses");
  await act("owner",()=>equipment.setStackEquipmentStateAction({characterId,itemId:stackId,state:"equipped",quantity:2}));
  await act("owner",()=>equipment.setInstanceEquipmentStateAction({characterId,instanceId:copies[0].id,state:"equipped"}));
  assert.equal((await active()).length,2);
  await pool.query("update campaign_character_item_instance set current_charges=3 where id=$1",[copies[1].id]);
  const removeStack = await command(stackId,{operation:"remove",instanceId:null,state:"equipped",quantity:2});
  await run(removeStack); await assert.rejects(run(removeStack),/already completed/);
  assert.equal((await active()).length,1);
  const view = await act("owner",()=>equipment.getCharacterEquipmentState(characterId));
  assert.equal(view.stacks.find(row=>row.itemId===stackId).inactiveQuantity,3);
  const removeCopy = await command(copyId,{operation:"remove",instanceId:copies[0].id,state:"equipped"});
  await run(removeCopy); await assert.rejects(run(removeCopy),/already completed/);
  assert.equal((await active()).length,0);
  assert.equal((await pool.query("select current_charges from campaign_character_item_instance where id=$1",[copies[1].id])).rows[0].current_charges,3);
  assert.equal((await pool.query("select current_charges from campaign_character_item_instance where id=$1",[copies[0].id])).rows[0].current_charges,7);
  await assert.rejects(run(await command(copyId,{operation:"remove",instanceId:before.itemInstances[0].id,state:"inactive"})),/exact copy/);
  const otherCopy = (await pool.query("select id from campaign_character_item_instance where character_id=$1 limit 1",[ids[0]])).rows[0].id;
  await assert.rejects(run(await command(copyId,{operation:"remove",instanceId:otherCopy,state:"inactive"})),/exact copy/);
  await pool.query("delete from campaign_inventory_item where campaign_id=$1 and item_id=$2",[campaignId,stackId]);
  await pool.query("update items set archived_at=now() where id=$1",[copyId]);
  const retained = await act("owner",()=>actions.getCharacter(characterId,true));
  assert.equal(retained.authorizedItems.find(row=>row.id===stackId).campaignAvailable,false);
  assert.ok(retained.items.some(row=>row.itemId===stackId));
  for (const itemId of [stackId,copyId]) await assert.rejects(run(await command(itemId)),/not currently available/);
  const staleDraft = characterAggregateToDraft(retained);
  await run(await command(stackId,{operation:"remove",instanceId:null,state:"inactive",quantity:3}));
  await run(await command(copyId,{operation:"remove",instanceId:copies[1].id,state:"inactive"}));
  await assert.rejects(act("owner",()=>actions.saveCharacter(characterId,staleDraft,false,true)), /changed|reload|Reload/);
  const after = await act("owner",()=>actions.getCharacter(characterId,true));
  const omitTime = profile=>Object.fromEntries(Object.entries(profile).filter(([key])=>!["commerceVersion","updatedAt"].includes(key)));
  assert.deepEqual(omitTime(after.profile),omitTime(before.profile));
  assert.deepEqual(after.items,before.items); assert.deepEqual(after.itemInstances,before.itemInstances);
  assert.deepEqual(after.attributes,before.attributes); assert.deepEqual(after.skillAllocations,before.skillAllocations); assert.deepEqual(after.currencyHoldings,before.currencyHoldings);
  assert.equal(after.character.name,before.character.name);
  assert.equal(after.character.playerUserId,before.character.playerUserId);
});


test("owner inventory respects active combat and loaded/attached ammunition while new exact copies start empty", async () => {
  const characterId=ids[2];
  const campaignId=(await pool.query("select campaign_id from campaign_character where id=$1",[characterId])).rows[0].campaign_id;
  const modelIds=[];
  for (const name of ["AMMO","GUN","MAGAZINE"]) modelIds.push((await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis) values($1,$1,'equipment','weapon','Weapon','Test','Test','unit') returning id",[`OWNER-${name}`])).rows[0].id);
  const [ammoId,gunId,magazineId]=modelIds;
  for (const [i,itemId] of modelIds.entries()) await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)",[campaignId,itemId,200+i]);
  const ammoProfile=(await pool.query("insert into weapon_profiles(item_id,profile_record_type) values($1,'Ammunition') returning id",[ammoId])).rows[0].id;
  const gunProfile=(await pool.query("insert into weapon_profiles(item_id,profile_record_type,ammunition_item_id) values($1,'Weapon',$2) returning id",[gunId,ammoId])).rows[0].id;
  const mode=(await pool.query("insert into weapon_firing_modes(weapon_profile_id,name,normalized_name,sort_order,mechanics_review_required) values($1,'Single','single',0,true) returning id",[gunProfile])).rows[0].id;
  await pool.query("insert into magazine_profiles(item_id,capacity_rounds) values($1,5)",[magazineId]);
  await pool.query("insert into magazine_ammunition(magazine_item_id,ammunition_item_id) values($1,$2)",[magazineId,ammoId]);
  await pool.query("insert into weapon_magazines(weapon_profile_id,magazine_item_id) values($1,$2)",[gunProfile,magazineId]);
  const command=async (itemId,extra={})=>({characterId,itemId,quantity:1,operation:"grant",expectedCommerceVersion:(await pool.query("select commerce_version from campaign_character_profile where character_id=$1",[characterId])).rows[0].commerce_version,...extra});
  const run=input=>act("owner",()=>inventory.adjustOwnerInventoryAction(input));
  for (const itemId of [gunId,magazineId]) await run(await command(itemId));
  const copies=(await pool.query("select * from campaign_character_item_instance where character_id=$1 and item_id=any($2::int[]) and retired_at is null order by id",[characterId,[gunId,magazineId]])).rows;
  const [gun,magazine]=copies;
  assert.deepEqual(copies.map(row=>[row.current_charges,row.loaded_rounds,row.loaded_ammunition_item_id,row.equipment_state]),[[0,0,null,"inactive"],[0,0,null,"inactive"]]);
  assert.equal((await pool.query("select * from campaign_character_firearm_state where item_instance_id=$1",[gun.id])).rows.length,0,"No invented firearm setup");
  await pool.query("insert into campaign_character_firearm_state(item_instance_id,campaign_id,character_id,item_id,weapon_profile_id,selected_firing_mode_id,loaded_ammunition_item_id,loaded_ammunition_profile_id,loaded_ammunition_unit_cost_credits,loaded_rounds,initialization_key,initialized_by_user_id,updated_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8,2,3,'owner-fixture','sheet-owner','sheet-owner')",[gun.id,campaignId,characterId,gunId,gunProfile,mode,ammoId,ammoProfile]);
  await pool.query("update campaign_character_item_instance set loaded_rounds=2,loaded_ammunition_item_id=$2,loaded_ammunition_unit_cost_credits=2 where id=$1",[magazine.id,ammoId]);
  const removal=async copy=>command(copy.item_id,{operation:"remove",instanceId:copy.id,state:"inactive"});
  for (const copy of copies) await assert.rejects(run(await removal(copy)),/Unload|empty/);
  assert.equal((await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1",[gun.id])).rows[0].loaded_rounds,3);
  assert.equal((await pool.query("select loaded_rounds from campaign_character_item_instance where id=$1",[magazine.id])).rows[0].loaded_rounds,2);
  await pool.query("update campaign_character_item_instance set loaded_rounds=0,loaded_ammunition_item_id=null,loaded_ammunition_unit_cost_credits=0 where id=$1",[magazine.id]);
  await pool.query("update campaign_character_firearm_state set loaded_rounds=0,loaded_ammunition_item_id=null,loaded_ammunition_profile_id=null,loaded_ammunition_unit_cost_credits=null where item_instance_id=$1",[gun.id]);
  await pool.query("insert into firearm_magazine_attachment(weapon_instance_id,magazine_instance_id,character_id,campaign_id,weapon_item_id,weapon_profile_id,magazine_item_id) values($1,$2,$3,$4,$5,$6,$7)",[gun.id,magazine.id,characterId,campaignId,gunId,gunProfile,magazineId]);
  for (const copy of copies) await assert.rejects(run(await removal(copy)),/Detach/);
  await pool.query("delete from firearm_magazine_attachment where weapon_instance_id=$1",[gun.id]);
  const sessionId=(await pool.query("insert into campaign_session(campaign_id,title,sequence_number) values($1,'Inventory guard',1) returning id",[campaignId])).rows[0].id;
  const sceneId=(await pool.query("insert into campaign_session_scene(session_id,campaign_id,sequence_number,title) values($1,$2,1,'Inventory guard') returning id",[sessionId,campaignId])).rows[0].id;
  const encounterId=(await pool.query("insert into campaign_session_encounter(scene_id,session_id,campaign_id,sequence_number,title,status,started_at) values($1,$2,$3,1,'Inventory guard','active',now()) returning id",[sceneId,sessionId,campaignId])).rows[0].id;
  await pool.query("insert into campaign_session_encounter_participant(encounter_id,scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4,$5)",[encounterId,sceneId,sessionId,campaignId,characterId]);
  await assert.rejects(run(await command(ammoId)),/active combat/);
  await assert.rejects(run(await removal(gun)),/active combat/);
  await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1",[encounterId]);
  await assert.rejects(run(await command(ammoId)),/paused/);
  await assert.rejects(run(await removal(gun)),/paused/);
  const frozenRecord=await act("owner",()=>actions.getCharacter(characterId,true));
  await assert.rejects(act("owner",()=>actions.saveCharacter(characterId,characterAggregateToDraft(frozenRecord),false,true)),/paused/);
  await pool.query("delete from campaign_session where id=$1",[sessionId]);
  for (const copy of copies) await run(await removal(copy));
  assert.equal((await pool.query("select * from campaign_character_item_instance where character_id=$1 and item_id=any($2::int[]) and retired_at is null",[characterId,[gunId,magazineId]])).rows.length,0);
});

 test("grants and removals during creation preserve funds on later profile saves and purchases", async () => {
  const characterId=ids[1];
  await pool.query("update campaign_character_profile set creation_completed_at=null where character_id=$1",[characterId]);
  let record=await act("player",()=>actions.getCharacter(characterId,false));
  const itemId=record.items.find(item=>item.name==="Brass Compass").itemId;
  await pool.query("update items set credits=10 where id=$1",[itemId]);
  await pool.query("update campaign_character_item set unit_cost_credits=10 where character_id=$1 and item_id=$2",[characterId,itemId]);
  await pool.query("update campaign_character_profile set credits_remaining=90 where character_id=$1",[characterId]);
  const adjust=async extra=>act("owner",async()=>inventory.adjustOwnerInventoryAction({characterId,itemId,operation:"grant",quantity:1,expectedCommerceVersion:(await actions.getCharacter(characterId,true)).profile.commerceVersion,...extra}));
  await adjust({});
  record=await act("player",()=>actions.getCharacter(characterId,false));
  assert.equal(record.profile.creditsRemaining,90);
  assert.equal(record.items.find(item=>item.itemId===itemId).unitCostCredits,5);
  record=await act("player",()=>actions.saveCharacter(characterId,characterAggregateToDraft(record),false,false));
  assert.equal(record.profile.creditsRemaining,90);
  await adjust({operation:"remove",instanceId:null,state:"inactive",quantity:1});
  record=await act("player",()=>actions.getCharacter(characterId,false));
  record=await act("player",()=>actions.saveCharacter(characterId,characterAggregateToDraft(record),false,false));
  assert.equal(record.profile.creditsRemaining,90,"Profile save cannot refund administrative removal");
  const forged=characterAggregateToDraft(record);
  const forgedStack=forged.items.find(item=>item.itemId===itemId); forgedStack.quantity=1000; forgedStack.unitCostCredits=(5+999*10)/1000;
  await assert.rejects(act("player",()=>actions.saveCharacter(characterId,forged,false,false)),/not enough starting funds/);
  const draft=characterAggregateToDraft(record);
  const stack=draft.items.find(item=>item.itemId===itemId); stack.quantity=2; stack.unitCostCredits=7.5;
  record=await act("player",()=>actions.saveCharacter(characterId,draft,true,false));
  assert.equal(record.profile.creditsRemaining,80,"Only the extra purchased copy costs 10");
  assert.ok(record.profile.creationCompletedAt);
  // Restore only this disposable browser fixture after verifying creation.
  await pool.query("update campaign_character_item set quantity=1,unit_cost_credits=0 where character_id=$1 and item_id=$2",[characterId,itemId]);
  await pool.query("update items set credits=0 where id=$1",[itemId]);
  await pool.query("update campaign_character_profile set credits_remaining=100 where character_id=$1",[characterId]);
});
