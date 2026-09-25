import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import type { Page } from "playwright-core";
import { createEmptySpell } from "../src/features/spell-construction/utilities/spellFactory";
import { calculateSpell } from "../src/features/spell-construction/engine/calculateSpell";
import { getCharacterHp } from "../src/features/characters/character-rules";
import { capturePaperPdf } from "./character-paper-review";

/** Called only inside the disposable Pass 1 harness. No production connection or route. */
export async function rehearsePaperCharacterSheets(pool: pg.Pool, login: (id: string) => Promise<Page>, baseUrl: string) {
  const database = (await pool.query("select current_database() name")).rows[0].name;
  assert.equal(database, "serrian_character_sheet_dev");
  const output = path.resolve("docs/samples/paper-character-sheet");
  await mkdir(output, { recursive: true });
  const insertId = async (sql: string, values: unknown[] = []): Promise<number> => (await pool.query(sql, values)).rows[0].id;
  const campaignId = await insertId("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id) values('The Lantern Coast — DEMO',220,200,100,10,100,200,'Credits','Assigned',4,'sheet-owner') returning id");
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,'sheet-player')", [campaignId]);
  await pool.query("insert into campaign_allowed_system(campaign_id,system) values($1,'Spellcraft'),($1,'Tier 1'),($1,'Tier 2'),($1,'Tier 3')", [campaignId]);
  const raceId = await insertId("insert into races(name,size,base_magic) values('Coastborn (demo)','Medium',3) returning id");
  await pool.query("insert into race_movement_modes(race_id,movement_mode,base_value,notes) values($1,'Land',3,''),($1,'Swim',1,'')", [raceId]);
  for (const table of ["campaign_race", "campaign_allowed_race"]) await pool.query(`insert into ${table}(campaign_id,race_id) values($1,$2)`, [campaignId, raceId]);
  const skillSpecs = [
    ["Athletics", "STR", "Physical training for the coast patrol."], ["Awareness", "WIS", "Observe people, terrain and changing weather."],
    ["Coastwatch Baton", "DEX", "The recorded governing skill for the demo baton."], ["Navigation", "INT", "Read charts and maintain the route log."],
    ["Spellcraft", "INT", "The character's recorded Spellcraft framework."], ["Channeling", "WIS", "The recorded source of this character's mana pool."],
  ];
  const skills = [] as number[];
  for (const [name, attribute, definition] of skillSpecs) {
    const existing=(await pool.query('select id from skill where name=$1 order by id limit 1',[name])).rows[0];
    skills.push(existing?.id ?? await insertId("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'standard',1,$2,$3) returning id", [name, attribute, definition]));
  }
  const itemSpecs = [
    ["Coastwatch Baton", "weapon", "Weapon", "An ash baton with a leather wrist loop."],
    ["Leather Arm Guards", "armor", "Armor", "A fitted pair protecting the recorded arm locations."],
    ["Healing Potion", null, "Item", "A stoppered restorative; apply its recorded healing effect."],
    ["Trail Rations", null, "Item", "Wrapped portions of dried food."],
    ["Brass Compass", null, "Item", "A pocket compass marked with the patrol insignia."],
    ["Restorative Wand", "general", "Item", "Individually tracked copies; each retains its own remaining charges."],
  ] as const;
  const itemIds = [] as number[];
  for (const [index, [name, group, record, description]] of itemSpecs.entries()) {
    const id = await insertId("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,price_basis,credits) values($1,$2,$3,$4,$5,'Demo','Travel',$6,'unit',0) returning id", [`PAPER-DEMO-${index}`, name, group ? "equipment" : "inventory", group, record, description]);
    itemIds.push(id);
    await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)", [campaignId,id,index]);
  }
  const [baton, armor, potion, rations, compass, wand] = itemIds;
  const weapon = await insertId("insert into weapon_profiles(item_id,profile_record_type,weapon_type,damage,damage_type,initiative_cost,range_mode,reach_text,reach_distance,distance_unit,handedness) values($1,'Weapon','Baton','4','Bludgeoning',4,'melee','3 ft',3,'ft','One-handed') returning id", [baton]);
  await pool.query("insert into weapon_skill_path_mappings(weapon_profile_id,endpoint_skill_id,review_state,sort_order,updated_by_user_id) values($1,$2,'approved',0,'sheet-owner')", [weapon,skills[2]]);
  await pool.query("insert into armor_profiles(item_id,armor_type,coverage,base_soak) values($1,'Leather','Right Arm, Left Arm',2)", [armor]);
  // Existing canonical location keys, not new anatomy.
  await pool.query("insert into armor_location_reference(location_code,location_name,sort_order) values('1','Right Arm',1),('2','Left Arm',2) on conflict do nothing");
  await pool.query("insert into armor_locations(item_id,location_code,sort_order) values($1,'1',0),($1,'2',1)", [armor]);
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,quantity_per_use,activation_label) values($1,'consume-item',1,'Drink')", [potion]);
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use,activation_label) values($1,'charges',5,1,'Use')", [wand]);
  for (const id of [potion,wand]) await pool.query("insert into item_effects(item_id,schema_version,effect_json,sort_order) values($1,2,$2,0)", [id,JSON.stringify({kind:"health.heal",amount:3,scope:"full-body"})]);
  const characters = [] as number[];
  const names = ["Mara Reed — DEMO A", "Ilyra Voss — DEMO B", "Draft integrity — DEMO"];
  for (const [index,name] of names.entries()) {
    const id = await insertId("insert into campaign_character(campaign_id,player_user_id,name) values($1,'sheet-player',$2) returning id", [campaignId,name]); characters.push(id);
    await pool.query("insert into campaign_character_profile(character_id,race_id,age,sex,height_feet,height_inches,weight,deity,personality,goals,secrets,backstory,motivations,fate_points,fame,experience,total_experience,quintessence,total_quintessence,credits_remaining,creation_completed_at) values($1,$2,29,'Female',5,8,140,'None','Patient and observant','Reopen the coast road','A sealed letter remains unread','A former lighthouse keeper now travelling with the coast patrol.','Bring the missing patrol home',4,17,245,1290,23,88,137.5,$3)",[id,raceId,index===2?null:new Date()]);
    const values = index === 1 ? [35,40,35,45,40,30] : [32,35,30,25,30,28];
    for (const [i,key] of ['STR','DEX','CON','INT','WIS','CHR'].entries()) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,$3)",[id,key,values[i]]);
    for (const [i,skillId] of skills.entries()) if (index===1 || i<4) await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,$3)", [id,skillId,i===4?1:i===5?18:10+i*2]);
    for (const [itemId,quantity] of [[baton,2],[armor,1],[potion,3],[rations,5],[compass,1]]) await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,$3,0)", [id,itemId,quantity]);
    await pool.query("insert into campaign_character_item_equipment_state(character_id,item_id,state,quantity) values($1,$2,'wielded',1),($1,$3,'worn',1)",[id,baton,armor]);
    await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,7)",[id]);
    await pool.query("insert into campaign_character_active_health_pool(character_id,pool_key,pool_name_snapshot,damage) values($1,'rightArm','Right Arm',3),($1,'torso','Torso',4)",[id]);
    if(index===1) {
      await pool.query("insert into campaign_character_active_mana(character_id,system,mana_spent) values($1,'Spellcraft',17)",[id]);
      for (const [charges,state] of [[2,'inactive'],[4,'equipped']]) await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits,equipment_state) values($1,$2,$3,0,$4)",[id,wand,charges,state]);
    }
  }
  const developed = characters[1];
  let parent: number | null = null;
  let parentSkill: number | null = null;
  const paths = ["Scholarship", "Maritime history and coastal settlements", "Old beacon archives and the northern trade routes"];
  for (let i=0;i<12;i++) {
    const skillId = await insertId("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'standard',$2,'INT',$3) returning id",[i<3?paths[i]:`Field specialty ${i-2}: charts, dialects and weather journals`,i<3?i+1:1,`Recorded field specialty ${i+1}. The notebook preserves observations of beacon signals, coastal tracks and the people who maintain them. This is a disposable sample skill definition, not an addition to the game catalog.`]);
    if (i<3 && parentSkill) await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type,sort_order) values($1,$2,'parent',0)",[skillId,parentSkill]);
    const allocation = await insertId("insert into campaign_character_skill_allocation(character_id,skill_id,parent_allocation_id,points) values($1,$2,$3,12) returning id", [developed,skillId,i<3?parent:null]);
    parent=allocation; parentSkill=skillId;
  }
  const supplyNames = ["Canvas travel bag", "Waxed map case", "Spare lamp wicks", "Chalk sticks", "Flint and steel", "Coiled rope", "Sailmaker's needle", "Weather journal", "Ink bottle", "Signal whistle", "Folding cup", "Blanket", "Sealed dispatch for the keeper of the northernmost lighthouse", "Spare gloves", "Wooden tokens", "Oil flask"];
  for (const [index,name] of supplyNames.entries()) {
    const id = await insertId("insert into items(canonical_id,name,catalog_scope,record_type,family,category,description,price_basis,credits) values($1,$2,'inventory','Item','Demo','Travel',$3,'unit',0) returning id", [`PAPER-SUPPLY-${index}`,name,`Personal travel supply ${index+1}, marked with Ilyra's initials. Kept as an ordinary owned item in this demonstration.`]);
    await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)",[campaignId,id,index+itemIds.length]);
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,$3,0)",[developed,id,index%3+1]);
  }
  for (const [index,name] of ["Lantern at the Breakwater", "Mending the Watchkeeper", "A Line of Light Through the Storm"].entries()) {
    const spell = createEmptySpell();
    spell.name=name; spell.castingSystem="Spellcraft"; spell.frameworkSkillId=skills[4]; spell.sphere="Light";
    spell.description = `DEMO construction ${index+1}. A thin line of light follows the caster's hand as the target is identified. ` +
      `The descriptive record accompanies the structured construction below; it does not grant additional effects. ` +
      `The caster's notebook describes the sound of surf against the breakwater and the reflected light on wet stone. `.repeat(index===2?20:3) + `End of description ${index+1}.`;
    spell.notes = `Sample limitation ${index+1}: use the authored target, range, duration and effects below. Decorative narrative does not expand the construction. End of spell notes ${index+1}.`;
    spell.containers[0].effects = [{id:`paper-effect-${index}`,ruleId:index===1?'healing':'damage',quantity:index+2,description:index===1?'A restorative effect on the selected target.':'A demo damage effect on the selected target.',...(index===1?{healingScope:'full-body' as const}:{})}];
    assert.ok(calculateSpell(spell).baseSpellManaCost > 0);
    await pool.query("insert into campaign_character_spell_document(character_id,document_id,name,tradition,document_json,in_spellbook) values($1,$2,$3,$4,$5,true)",[developed,spell.id,name,spell.tradition,JSON.stringify(spell)]);
  }
  const tables=(await pool.query("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_')) order by table_name")).rows;
  const snapshot=async()=> { const values=[]; for(const {table_name:table} of tables) { assert.match(table,/^campaign_character(?:_[a-z_]+)?$/); values.push((await pool.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) value from "${table}" r`)).rows[0].value); } return values; };
  const before=await snapshot();
  const player=await login('sheet-player');
  await player.addInitScript("window.print = function () { document.documentElement.dataset.paperPrintCalls = String(Number(document.documentElement.dataset.paperPrintCalls || 0) + 1); };");
  async function selectPaper(page:Page,id:number,manager=false) {
    await page.goto(`${baseUrl}/${manager?'heavens':'realms'}/characters/${id}`);
    await page.getByText('Print options',{exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Tabletop Quick Reference/}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:/^Paper Character Sheet/}).click();
    await page.getByText(/^Ready:/).waitFor();
    assert.equal(await page.locator('.printable-character-sheet').count(),0);
    assert.equal(await page.locator('.paper-character-sheet').getAttribute('data-character-id'),String(id));
  }
  for (const [i,id] of characters.slice(0,2).entries()) {
    await selectPaper(player,id);
    assert.equal(await player.locator('.paper-reference-start').count(),0,'References are optional and off by default');
    if(i===1) for(const label of ['Spell / ability play references','Full skill descriptions','Full item descriptions']) await player.getByLabel(label,{exact:true}).check();
    await player.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
    await player.waitForFunction(()=>document.documentElement.dataset.paperPrintCalls==='1', undefined, {timeout:15000}).catch(async (error) => {
      console.log(await player.evaluate(()=>({calls:document.documentElement.dataset.paperPrintCalls,print:String(window.print),fonts:document.fonts.status,visibility:document.visibilityState,status:document.querySelector('.paper-print-status')?.textContent})));
      throw error;
    });
    const root=player.locator('.paper-character-sheet');
    const text=await root.innerText();
    assert.ok(text.includes(names[i]));
    const maxHp=getCharacterHp(i===0?30:35,0);
    const total=await root.locator('.paper-total').innerText();
    assert.ok(total.includes(String(maxHp-7)) && total.includes(String(maxHp)));
    assert.ok(text.includes('Wielded 1/2; Unequipped 1/2'));
    assert.ok(text.includes('245') && text.includes('1290') && text.includes('23') && text.includes('88'));
    if(i===0) { assert.equal(await root.locator('.paper-power-start').count(),0); assert.equal(await root.getByRole('heading',{name:'Mana',exact:true}).count(),0); }
    else { assert.ok(text.includes('2/5 charges') && text.includes('4/5 charges')); assert.equal(await root.locator('.paper-spell').count(),3); assert.ok(text.includes('37 / 54') && text.includes('17 spent'),'Recorded mana spending and existing maximum calculation'); }
    const label=i===0?'example-a':'example-b';
    await capturePaperPdf(player,label,{name:names[i],campaign:'The Lantern Coast — DEMO'});
  }
  // The manager uses the same saved Character, not the signed-in user's own Character.
  const owner=await login('sheet-owner');
  await selectPaper(owner,characters[1],true);
  assert.ok((await owner.locator('.paper-character-sheet').textContent())?.includes(names[1]));
  await owner.getByLabel('Story / profile',{exact:true}).check();
  assert.ok((await owner.locator('.paper-story-start').textContent())?.includes('A sealed letter remains unread'));
  // Existing selections remain exclusive; their default is unchanged after reload.
  for(const preset of ['Tabletop Quick Reference','Full Tabletop Character','Complete Character Record','Custom Print']) {
    await owner.getByRole('button',{name:new RegExp(`^${preset}`)}).click();
    assert.equal(await owner.locator('.paper-character-sheet').count(),0);
    assert.equal(await owner.locator('.printable-character-sheet').count(),1);
    await owner.emulateMedia({media:'print'});
    assert.equal(await owner.locator('.printable-character-sheet').isVisible(),true);
    await owner.pdf({path:path.resolve('artifacts/character-sheet-pass-one',`legacy-${preset.replaceAll(' ','-')}.pdf`),preferCSSPageSize:true,printBackground:false});
    await owner.emulateMedia({media:'screen'});
  }
  await selectPaper(player,characters[2]);
  await player.setViewportSize({width:390,height:844});
  assert.equal(await player.locator('.character-print-center').evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);
  await player.setViewportSize({width:1440,height:1000});
  await player.getByLabel(/Character Name/).fill('UNSAVED NAME MUST STAY');
  await player.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
  const dialog=player.getByRole('dialog',{name:'Print the last saved record?',exact:true});
  await dialog.waitFor();
  await dialog.getByRole('button',{name:'Return to editing',exact:true}).click();
  assert.equal(await player.getByLabel(/Character Name/).inputValue(),'UNSAVED NAME MUST STAY');
  assert.equal(await player.evaluate(()=>document.documentElement.dataset.paperPrintCalls),undefined);
  await player.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();
  await dialog.getByRole('button',{name:'Print saved record',exact:true}).click();
  await player.waitForFunction(()=>document.documentElement.dataset.paperPrintCalls==='1');
  assert.equal(await player.getByLabel(/Character Name/).inputValue(),'UNSAVED NAME MUST STAY');
  assert.ok((await player.locator('.paper-character-sheet').textContent())?.includes(names[2]));
  assert.ok(!(await player.locator('.paper-character-sheet').textContent())?.includes('UNSAVED NAME MUST STAY'));
  assert.deepEqual(await snapshot(),before,'All print selections and unsaved-edit choices must preserve Character/runtime/ownership rows');
  console.log('PASS: integrated Paper option, selected saved Character, player/owner routes, old presets, dirty cancel/print, no Character writes; two actual PDFs generated');
}
