import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { actors, db, pool, fixture, creatureSubject, allRows, one, rows, completionDraft, declarationApi, readCombatCommandSources, readIncomingEffectEncounterTargetInTransaction } from './fixtures/evolution-runtime-fixture.mjs';
const forms = await import('../src/features/forms/form-runtime-service.ts');
const effective = await import('../src/features/forms/effective-form-service.ts');
const capabilities = await import('../src/features/forms/form-capability-service.ts');
const { emptyRaceForm } = await import('../src/features/races/race-forms.ts');
const { emptyRaceFormMechanics } = await import('../src/features/races/race-form-mechanics.ts');
const { emptyFormTransformation } = await import('../src/features/forms/form-transformation.ts');
const { saveRaceFormsInTransaction, readRaceFormsInTransaction } = await import('../src/features/races/race-form-service.ts');
const { emptyCreatureFormMechanics } = await import('../src/features/creatures/creature-forms.ts');
const { creatureFormFixture } = await import('./creature-form-fixture.ts');
const { wolfFormMechanics } = await import('./race-form-mechanics-fixture.ts');
const { readActiveHealthInTransaction } = await import('../src/features/active-state/active-health-service.ts');
const { loadCharacterSkillLineageInputInTransaction } = await import('../src/features/items/character-weapon-governance-service.ts');
const { resolveCharacterSkillLineageSelection } = await import('../src/features/items/character-weapon-governance.ts');
const { readRaceAttackSourcesInTransaction } = await import('../src/features/tabletop-operations/race-natural-attack-service.ts');
const { resolveInitiativeCapacityOptionsInTransaction } = await import('../src/features/tabletop-operations/initiative-capacity-service.ts');
const { readEncounterCreatureAttacksInTransaction, readEncounterCreatureAbilitiesInTransaction } = await import('../src/features/tabletop-operations/runtime-integration-service.ts');
const { resolveEffectiveCreatureStatistics } = await import('../src/features/creatures/creature-size-rules.ts');
const { readAbilityFactsInTransaction } = await import('../src/features/ability-use-conditions/fact-service.ts');
const { parseRollGoverningSourceSnapshot, normalizeRollMechanicalRequest } = await import('../src/features/tabletop-operations/roll-mechanical-snapshot.ts');
const { saveRaceNaturalProtectionInTransaction } = await import('../src/features/races/race-natural-protection-service.ts');
after(() => pool.end());
const instant = { mode: 'instant', initiativeCost: null, time: '', notes: '' };
const transformation = () => ({ ...emptyFormTransformation(), entryMethod: 'voluntary', entryTiming: instant, exitTiming: instant, entryCosts: { mode: 'none', costs: [] }, exitCosts: { mode: 'none', costs: [] }, exitMethods: ['voluntary'], duration: { mode: 'voluntary-end', description: '' }, limitMode: 'unlimited' });
async function raceSetup(mechanics = emptyRaceFormMechanics()) {
  const f = await fixture('forms-effective');
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...emptyRaceForm('effective'), name: 'Effective Form', mechanics, transformation: transformation() }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  f.form = (await db.transaction(tx => readRaceFormsInTransaction(tx, f.source.ancestry.id)))[0]; return f;
}
async function creatureSetup(mechanics = emptyCreatureFormMechanics()) {
  const f = await fixture('forms-effective-creature'), c = await creatureSubject(f);
  const profile = await one('select * from campaign_creature_npc_profile where character_id=$1', [c.id]);
  const normal = JSON.parse(profile.current_snapshot_json);
  const form = { ...creatureFormFixture(), id: 900010, creatureId: c.from.id, name: 'Effective Creature Form', mechanics, transformation: transformation() };
  normal.forms = [form]; await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1', [c.id, JSON.stringify(normal)]);
  return { ...f, heroId: c.id, form, normal, c };
}
async function change(f, operation = 'enter') {
  const review = await forms.previewFormTransition({ characterId: f.heroId, operation, ...(operation === 'enter' ? { formId: f.form.id, formKey: f.form.key, sourceId: f.form.raceId ?? f.form.creatureId } : {}) }, f.actor);
  return forms.executeFormTransition({ characterId: f.heroId, operation, formId: review.definition.formId, formKey: review.definition.key, sourceId: review.definition.sourceId, reviewToken: review.reviewToken, idempotencyKey: randomUUID(), rulings: {}, confirmTime: false }, f.actor);
}
const current = f => db.transaction(tx => effective.readEffectiveFormInTransaction(tx, f.heroId));
const lineage = f => db.transaction(tx => loadCharacterSkillLineageInputInTransaction(tx, f.heroId));
const health = (f, kind = 'race') => db.transaction(tx => readActiveHealthInTransaction(tx, f.heroId, kind));
const attacks = f => db.transaction(tx => readRaceAttackSourcesInTransaction(tx, f.context, f.heroId));
const target = f => db.transaction(tx => readIncomingEffectEncounterTargetInTransaction(tx, f.context, f.heroId));
const choices = f => actors.run(f.godId, () => readCombatCommandSources({ role: 'god', encounterId: f.encounterId }, f.heroId));
const rules = (key = 'same', percentage = 25, creature = false) => ({ schemaVersion: 1, rules: [{ key, name: `${key} resistance`, ruleType: 'resistance', scope: 'damage', match: 'ALL', percentage, notes: '', sortOrder: 0, ...(creature ? { crImpact: 'Minor' } : {}), conditions: [{ key, kind: 'damage-type', damageType: 'Fire' }] }] });

test('Normal readers remain identical after an active no-op Form cycle', async () => {
  const f = await raceSetup(), before = await lineage(f), normalTarget = await target(f), sources = (await choices(f)).sources;
  assert.equal(await current(f), null); await change(f); await change(f, 'return');
  assert.deepEqual(await lineage(f), before); assert.deepEqual(await target(f), normalTarget); assert.deepEqual((await choices(f)).sources, sources);
});
for (const key of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR']) test(`Race ${key}: saved base plus signed Form change, no cap, live advancement, Return`, async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments[key] = 150;
  const f = await raceSetup(m), normal = (await lineage(f)).attributes[key]; await change(f);
  assert.equal((await lineage(f)).attributes[key], normal + 150);
  assert.equal((await one('select value from campaign_character_attribute where character_id=$1 and attribute_key=$2', [f.heroId, key])).value, normal);
  await pool.query('update campaign_character_attribute set value=value+5 where character_id=$1 and attribute_key=$2', [f.heroId, key]);
  assert.equal((await lineage(f)).attributes[key], normal + 155); await change(f, 'return'); assert.equal((await lineage(f)).attributes[key], normal + 5);
});
test('Race Form Size does not scale Attributes; permanent HP steps and effective CON govern Health', async () => {
  const m = emptyRaceFormMechanics(); m.size = 'Large'; m.attributeAdjustments.CON = 10;
  const f = await raceSetup(m); await pool.query('update campaign_character_profile set hp_multiplier_steps=2 where character_id=$1', [f.heroId]);
  const before = await health(f); await change(f); const after = await health(f);
  assert.equal((await lineage(f)).attributes.STR, 60); assert.ok(after.anatomy.totalMaximumHp > before.anatomy.totalMaximumHp); assert.equal((await current(f)).effective.race.race.size, 'Large');
});
test('active library edits do not change frozen adjustments or override collections', async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.STR = 20; const f = await raceSetup(m); await change(f);
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...f.form, mechanics: { ...m, attributeAdjustments: { ...m.attributeAdjustments, STR: 90 } } }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  assert.equal((await lineage(f)).attributes.STR, 80); await change(f, 'return'); await change(f); assert.equal((await lineage(f)).attributes.STR, 150);
});
for (const mode of ['race', 'override', 'empty']) test(`Race movement ${mode}: current source, permanent steps and effective DEX`, async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 10;
  if (mode !== 'race') { m.movementMode = 'override'; m.movement = mode === 'empty' ? [] : [{ key: 'fly', movementMode: 'Flight', baseValue: 9, notes: '', sortOrder: 0 }]; }
  const f = await raceSetup(m); await pool.query("insert into race_movement_modes(race_id,movement_mode,base_value,notes,sort_order) values($1,'Land',4,'',0)", [f.source.ancestry.id]);
  await pool.query('update campaign_character_profile set base_movement_steps=1 where character_id=$1', [f.heroId]); await change(f);
  if (mode === 'empty') { await assert.rejects(db.transaction(tx => resolveInitiativeCapacityOptionsInTransaction(tx, f.heroId, f.campaignId)), /Movement mode/); return; }
  const capacity = await db.transaction(tx => resolveInitiativeCapacityOptionsInTransaction(tx, f.heroId, f.campaignId));
  assert.equal(capacity.dexterity, 60); assert.equal(capacity.movementModes[0].movementMode, mode === 'race' ? 'Land' : 'Flight'); assert.ok(capacity.movementModes[0].baseMovement > (mode === 'race' ? 4 : 9));
});
for (const mode of ['race', 'override', 'empty']) test(`Race protection ${mode}: exact active natural collection and anatomy`, async () => {
  const m = emptyRaceFormMechanics(); if (mode !== 'race') { m.protectionMode = 'override'; m.protections = mode === 'empty' ? [] : [{ key: 'form', name: 'Form hide', naturalSoak: 8, coverage: { kind: 'all' }, sortOrder: 0 }]; }
  const f = await raceSetup(m); await db.transaction(tx => saveRaceNaturalProtectionInTransaction(tx, f.source.ancestry.id, [{ key: 'normal', name: 'Normal hide', naturalSoak: 3, coverage: { kind: 'all' }, sortOrder: 0 }])); await change(f);
  const protection = (await target(f)).protection.natural; assert.equal(protection.length, mode === 'empty' ? 0 : 1); if (protection.length) { assert.equal(protection[0].soak, mode === 'race' ? 3 : 8); assert.equal(protection[0].armor, undefined); assert.match(protection[0].source.id, /^form:/); }
});
for (const mode of ['race', 'add', 'replace', 'empty']) test(`Race Interaction Rules ${mode}, including colliding source-local keys`, async () => {
  const m = emptyRaceFormMechanics(); m.interactionMode = mode === 'empty' ? 'replace' : mode; if (['add', 'replace'].includes(mode)) m.interactionRules = rules('same', 50);
  const f = await raceSetup(m); await pool.query('update races set interaction_rules_json=$2 where id=$1', [f.source.ancestry.id, rules()]); await change(f);
  const incoming = await target(f), effectiveRules = incoming.interactionRules?.rules ?? [];
  assert.equal(effectiveRules.length, mode === 'add' ? 2 : mode === 'empty' ? 0 : 1); assert.equal(new Set(effectiveRules.map(row => row.key)).size, effectiveRules.length);
  if (mode === 'add') assert.deepEqual(effectiveRules.map(row => row.provenance.source), ['normal', 'form']);
});
for (const mode of ['race', 'override', 'empty']) test(`Race attacks ${mode}: effective selection, Form identity, future source evidence`, async () => {
  const f = await raceSetup(), m = emptyRaceFormMechanics(); m.attributeAdjustments.STR = 20;
  if (mode !== 'race') { m.attacksMode = 'override'; m.attacks = mode === 'empty' ? [] : [{ ...wolfFormMechanics(f.skillId, f.skillId).attacks[0], anatomy: { hpPoolIds: [], hitLocationNumbers: [], notes: '' } }]; }
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...f.form, mechanics: m }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  const normal = await attacks(f), entry = await change(f), projected = await attacks(f);
  assert.equal(projected.length, mode === 'empty' ? 0 : 1); if (projected.length) { assert.match(projected[0].ref, new RegExp(`^form:${entry.event.id}:`)); assert.equal(projected[0].definition.attackName, mode === 'race' ? 'Young claw' : 'Bite'); assert.equal(projected[0].currentForm.key, f.form.key); }
  assert.ok(!projected.some(row => row.ref === normal[0].ref)); await change(f, 'return'); assert.equal((await attacks(f))[0].ref, normal[0].ref);
});
test('temporary Tier 1 Skill is an explicit Form source, never an allocation row; Roll snapshot round-trips', async () => {
  const f = await raceSetup(); const added = await one("insert into skill(name,classification,tier,primary_attribute,definition) values('Form-only skill','standard',1,'STR','Temporary test') returning id");
  const m = emptyRaceFormMechanics(); m.skillsMode = 'add'; m.skillLinks = [{ skillId: added.id, skillName: '', skillClassification: '', linkType: 'Skill', value: 8, sortOrder: 0 }];
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...f.form, mechanics: m }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  const before = await rows('select * from campaign_character_skill_allocation where character_id=$1', [f.heroId]); await change(f);
  const input = await lineage(f), selected = resolveCharacterSkillLineageSelection(input, { kind: 'skill', allocationId: -added.id }); assert.ok(selected);
  assert.ok(selected.rollGoverningSource.formSource.entryEventId); assert.equal(selected.rollGoverningSource.formSource.skillId, added.id);
  assert.deepEqual(parseRollGoverningSourceSnapshot(selected.rollGoverningSourceSnapshot), selected.rollGoverningSourceSnapshot);
  assert.deepEqual(normalizeRollMechanicalRequest({ governingSource: selected.rollGoverningSource }).governingSource, selected.rollGoverningSource);
  assert.deepEqual(await rows('select * from campaign_character_skill_allocation where character_id=$1', [f.heroId]), before);
  await change(f, 'return'); assert.equal(resolveCharacterSkillLineageSelection(await lineage(f), { kind: 'skill', allocationId: -added.id }), null);
});
test('Active Health retains exact damage, orphaned pools, injury history and Normal pool damage on Return', async () => {
  const m = emptyRaceFormMechanics(); const { createHumanoidRaceAnatomy } = await import('../src/features/races/race-anatomy.ts');
  m.anatomyMode = 'override'; m.anatomy = createHumanoidRaceAnatomy(); const oldKey = m.anatomy.hpPools[0].canonicalId;
  m.anatomy.hpPools[0].canonicalId = 'form-new-pool'; m.anatomy.hitLocations.forEach(row => { if (row.hpPoolCanonicalId === oldKey) row.hpPoolCanonicalId = 'form-new-pool'; });
  const f = await raceSetup(m); await pool.query('insert into campaign_character_active_health(character_id,total_damage) values($1,19) on conflict(character_id) do update set total_damage=19', [f.heroId]);
  await pool.query('insert into campaign_character_active_health_pool(character_id,pool_key,pool_name_snapshot,damage) values($1,$2,$3,7)', [f.heroId, oldKey, m.anatomy.hpPools[0].poolName]);
  await pool.query("insert into campaign_character_injury(character_id,pool_key,pool_name_snapshot,name,damage_amount) values($1,$2,'Old','Exact old injury',7)", [f.heroId, oldKey]);
  const before = await health(f); await change(f); const after = await health(f);
  assert.equal(after.state.totalDamage, 19); assert.deepEqual(after.state, before.state); assert.ok(!after.anatomy.pools.some(row => row.key === oldKey)); assert.ok(after.anatomy.pools.some(row => row.key === 'form-new-pool'));
  assert.equal(after.state.pools.find(row => row.poolKey === 'form-new-pool'), undefined); await change(f, 'return'); assert.deepEqual(await health(f), before);
});
for (const category of ['attributes', 'movement', 'attacks', 'abilities', 'defenses']) for (const mode of ['creature', 'override', 'empty']) test(`Creature ${category} ${mode} uses the individual effective collection`, async () => {
  const m = emptyCreatureFormMechanics(); if (mode !== 'creature') m[category] = { mode: 'override', rows: mode === 'empty' ? [] : creatureFormFixture().mechanics[category].rows };
  const f = await creatureSetup(m); await change(f); const resolved = await current(f);
  assert.deepEqual(resolved.effective[category], mode === 'creature' ? resolved.normal[category] : m[category].rows);
  if (category === 'attacks') assert.equal((await db.transaction(tx => readEncounterCreatureAttacksInTransaction(tx, f.heroId))).length, resolved.effective.attacks.length);
  if (category === 'abilities') assert.equal((await db.transaction(tx => readEncounterCreatureAbilitiesInTransaction(tx, f.heroId))).length, resolved.effective.abilities.length);
});
test('Creature Size scales replacement Attributes, HP and movement with current individual HP Adjustment', async () => {
  const m = creatureFormFixture().mechanics; const f = await creatureSetup(m); await pool.query('update campaign_creature_npc_profile set hp_adjustment=11 where character_id=$1', [f.heroId]); await change(f);
  const resolved = await current(f), stats = resolveEffectiveCreatureStatistics(resolved.effective), activeHealth = await health(f, 'creature');
  assert.equal(activeHealth.anatomy.totalMaximumHp, stats.calculatedTotalMaximumHp + 11); assert.equal(stats.size, m.size); assert.ok(stats.sizeMultiplier !== 1);
  assert.equal(activeHealth.anatomy.pools[0].key, 'FORM-TORSO'); assert.deepEqual((await target(f)).protection.natural.map(row => [row.armor, row.soak]), [[4, 2]]);
});
for (const mode of ['creature', 'add', 'replace', 'empty']) test(`Creature Skills ${mode} retain textual ranks and exact duplicate replacement`, async () => {
  const m = emptyCreatureFormMechanics(), f = await creatureSetup(m); const second = await one("insert into skill(name,classification,tier,definition) values('Other Creature Skill','standard',1,'Test') returning id");
  f.normal.skillLinks = [{ skillId: f.skillId, skillName: 'Normal', skillClassification: 'standard', rank: 'Experienced', notes: '', sortOrder: 0 }, { skillId: second.id, skillName: 'Unrelated', skillClassification: 'standard', rank: 'Novice', notes: '', sortOrder: 1 }];
  m.skills = { mode: mode === 'empty' ? 'replace' : mode, rows: ['creature', 'empty'].includes(mode) ? [] : [{ ...f.normal.skillLinks[0], rank: 'Master' }] }; f.normal.forms[0].mechanics = m;
  await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1', [f.heroId, JSON.stringify(f.normal)]); await change(f);
  const links = (await current(f)).effective.skillLinks; assert.equal(links.length, mode === 'empty' ? 0 : mode === 'replace' ? 1 : 2); if (links.length) assert.equal(links.find(row => row.skillId === f.skillId).rank, mode === 'creature' ? 'Experienced' : 'Master');
});
for (const mode of ['creature', 'add', 'replace', 'empty']) test(`Creature Interaction Rules ${mode} preserve independent rule provenance`, async () => {
  const m = emptyCreatureFormMechanics(); m.interactionMode = mode === 'empty' ? 'replace' : mode; if (['add', 'replace'].includes(mode)) m.interactionRules = rules('same', 40, true);
  const f = await creatureSetup(m); f.normal.core.interactionRules = rules('same', 20, true); await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1', [f.heroId, JSON.stringify(f.normal)]); await change(f);
  const profile = (await target(f)).interactionRules; assert.equal(profile?.rules.length ?? 0, mode === 'empty' ? 0 : mode === 'add' ? 2 : 1); if (mode === 'add') assert.deepEqual(profile.rules.map(row => row.key), ['normal:same', 'form:same']);
});
test('Creature inherited snapshot stays live, master edits and Form edits cannot change frozen overrides', async () => {
  const f = await creatureSetup(); await change(f); const first = await current(f);
  f.normal.attributes[0].value += 7; f.normal.forms[0].mechanics.attributes = { mode: 'override', rows: [] };
  await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1', [f.heroId, JSON.stringify(f.normal)]);
  assert.equal((await current(f)).effective.attributes[0].value, first.effective.attributes[0].value + 7);
  await pool.query("update creatures set canonical_name='Edited master' where id=$1", [f.c.from.id]); assert.equal((await current(f)).effective.core.canonicalName, first.effective.core.canonicalName);
});
for (const state of ['full', 'none', 'limited']) test(`Form manipulation ${state} is authoritative; natural attacks remain available`, async () => {
  const m = emptyRaceFormMechanics(); m.manipulation = { state, notes: 'Do not parse these words' }; const f = await raceSetup(m); await change(f);
  const attempt = () => db.transaction(tx => capabilities.assertFormEquipmentUseInTransaction(tx, f.heroId));
  if (state === 'full') assert.equal((await attempt()).ruling, null); else await assert.rejects(attempt(), state === 'none' ? /cannot manipulate/ : /G.O.D./);
  if (state === 'limited') { const approved = await db.transaction(tx => capabilities.assertFormEquipmentUseInTransaction(tx, f.heroId, { userId: f.godId, reason: 'This grip can hold the exact tool.' })); assert.equal(approved.ruling.authorizedByUserId, f.godId); }
  assert.equal((await attacks(f)).length, 1);
});
for (const state of ['retained', 'unusable', 'merged', 'dropped', 'custom']) test(`Form equipment ${state} gates active use without mutating recorded gear`, async () => {
  const m = emptyRaceFormMechanics(); m.equipment = { state, notes: '' }; const f = await raceSetup(m); const before = await allRows(); await change(f);
  const attempt = () => db.transaction(tx => capabilities.assertFormEquipmentUseInTransaction(tx, f.heroId));
  if (state === 'retained') await attempt(); else await assert.rejects(attempt(), state === 'custom' ? /G.O.D./ : /unavailable/);
  const after = await allRows(); for (const name of Object.keys(before).filter(name => /item|magazine|inventory/.test(name))) assert.deepEqual(after[name], before[name], name);
  assert.match((await db.transaction(tx => capabilities.readFormCapabilitiesInTransaction(tx, f.heroId))).notice, /passive Worn Armor still applies/);
});
for (const state of ['normal', 'limited', 'none']) test(`Speech ${state} is a typed fact without invented spell requirements`, async () => {
  const m = emptyRaceFormMechanics(); m.speech = { state, notes: 'Not a structured spell requirement' }; const f = await raceSetup(m); await change(f);
  const facts = await db.transaction(tx => readAbilityFactsInTransaction(tx, { ...f.context, participantId: f.heroId, requestedKeys: ['state.form-speech'] })); assert.equal(facts.get('state.form-speech').value, state);
  assert.equal((await attacks(f)).length, 1);
});
test('Entering and Returning preserve Initiative enrollment, position, Hold/Pass, round, step and ownership', async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 100; const f = await raceSetup(m), before = await allRows(); await change(f); await change(f, 'return'); const after = await allRows();
  for (const name of ['campaign_character', 'campaign_session_encounter_participant', 'campaign_session_encounter_initiative_participant', 'campaign_session_encounter_initiative_runtime']) if (before[name]) assert.deepEqual(after[name], before[name], name);
});
test('new action preview binds Form identity and effective Attributes; Return restores Normal source', async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.STR = 20; const f = await raceSetup(m); const entry = await change(f);
  const snapshot = await db.transaction(tx => declarationApi.previewCombatDeclarationInTransaction(tx, f.context, f.god, { ...completionDraft(f.heroId, f.defenderId), sourceKind: 'attribute', sourceRef: 'attribute:STR' }));
  assert.equal(snapshot.currentForm.entryEventId, entry.event.id); assert.equal(snapshot.authoredSource.governingSnapshot.attributeValue, 80); const saved = JSON.stringify(snapshot);
  await change(f, 'return'); assert.equal(JSON.stringify(snapshot), saved);
  const normal = await db.transaction(tx => declarationApi.previewCombatDeclarationInTransaction(tx, f.context, f.god, { ...completionDraft(f.heroId, f.defenderId), sourceKind: 'attribute', sourceRef: 'attribute:STR' })); assert.equal(normal.authoredSource.governingSnapshot.attributeValue, 60); assert.equal(normal.currentForm, null);
});
test('negative direct Creature occurrence never consumes persistent Form state', async () => {
  const f = await raceSetup(); await change(f); const id = f.occurrences[0]; assert.equal(await db.transaction(tx => effective.readEffectiveFormInTransaction(tx, id)), null);
  const snapshot = { attacks: [{ canonicalId: 'direct', attackName: 'Occurrence attack' }] }; assert.deepEqual(await db.transaction(tx => effective.effectiveCreatureSnapshotInTransaction(tx, id, snapshot)), snapshot);
});


const { eq, and } = await import('drizzle-orm');
const rt = await import('../src/db/tabletop-operations-schema.ts');
const { recordRollInTransaction, readRollLedgerInTransaction } = await import('../src/features/tabletop-operations/roll-runtime-service.ts');
const { resolveCharacterWeaponGovernanceInTransaction } = await import('../src/features/items/character-weapon-governance-service.ts');
const { readActiveManaInTransaction } = await import('../src/features/active-state/active-mana-service.ts');
const { resolveIncomingEffect } = await import('../src/features/incoming-effects/resolve-incoming-effect.ts');
const { recordCombatSourceResolutionInTransaction } = await import('../src/features/tabletop-operations/combat-source-resolution-service.ts');
const { protectionPipelineFixture } = await import('./fixtures/protection-pipeline-fixture.ts');
const { magicCompletionDocument } = await import('./fixtures/magic-completion-fixture.ts');
const rollActor = f => ({ userId: f.godId, campaignId: f.campaignId, readAs: 'god-owner', canRecordGodOnly: true });
const rollInput = (f, governingSource) => ({ sessionId: f.sessionId, sceneId: f.sceneId, encounterId: f.encounterId, rollerCharacterId: f.heroId,
  method: 'entered', visibility: 'table', purposeKind: governingSource.kind, enteredTotal: 70, mechanical: { governingSource } });
const incoming = target => resolveIncomingEffect({ target, effect: { label: 'Fire test', amount: 20, harmful: null }, hitLocationKey: '0',
  source: { damageType: 'Fire', magical: true, sourceKind: 'weapon', weaponFamily: 'none', itemProperties: [], itemTags: [], mechanicalEffectKind: 'health.damage', conditionName: null } });

for (const kind of ['attribute', 'skill']) test(`ordinary ${kind} Roll recalculates authoritative Form facts and retains frozen ledger after Return`, async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 20; const f = await raceSetup(m);
  const allocation = await one('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,5) returning id', [f.heroId, f.skillId]);
  const selected = () => lineage(f).then(input => resolveCharacterSkillLineageSelection(input, kind === 'attribute' ? { kind, attributeKey: 'DEX' } : { kind, allocationId: allocation.id }));
  const normal = await selected(); const entry = await change(f); const projected = await selected(); assert.notEqual(projected.source.originalTarget, normal.source.originalTarget);
  const requested = kind === 'skill' ? { ...projected.rollGoverningSource, calculatedPercentage: 999 } : projected.rollGoverningSource;
  const roll = await db.transaction(tx => recordRollInTransaction(tx, rollActor(f), rollInput(f, requested)));
  assert.equal(roll.mechanicalSnapshot.governingSource.originalTarget, projected.source.originalTarget);
  assert.equal(roll.mechanicalSnapshot.governingSource.currentForm.entryEventId, entry.event.id);
  const frozen = await one('select * from campaign_session_roll where id=$1', [roll.id]);
  await change(f, 'return'); assert.deepEqual(await one('select * from campaign_session_roll where id=$1', [roll.id]), frozen);
  const ledger = await db.transaction(tx => readRollLedgerInTransaction(tx, rollActor(f), f.sessionId, { limit: 10 }));
  assert.equal(ledger.rolls.find(row => row.id === roll.id).mechanicalSnapshot.governingSource.currentForm.entryEventId, entry.event.id);
});

test('weapon and defensive governance use effective DEX and temporary Skill without saved allocations', async () => {
  const f = await raceSetup(), m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 20; m.skillsMode = 'add';
  m.skillLinks = [{ skillId: f.skillId, skillName: '', skillClassification: '', linkType: 'Skill', value: 5, sortOrder: 0 }];
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...f.form, mechanics: m }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  await change(f);
  const governed = await db.transaction(tx => resolveCharacterWeaponGovernanceInTransaction(tx, { userId: f.godId }, { campaignId: f.campaignId, characterId: f.heroId, itemId: f.weaponId, firingModeId: null }));
  assert.match(governed.status, /^resolved/); assert.equal(governed.rollGoverningSource.formSource.skillId, f.skillId);
  const attack = (await attacks(f))[0]; assert.equal(attack.governance.selected.rollGoverningSource.formSource.skillId, f.skillId);
  assert.equal((await rows('select * from campaign_character_skill_allocation where character_id=$1', [f.heroId])).length, 0);
  const sources = await choices(f); assert.ok(sources.defense.governingChoices.some(row => row.selection?.allocationId === -f.skillId || row.key.includes(String(-f.skillId))));
});

test('Race Base Magic and permanent magic steps remain live; entering and Returning never refill Mana', async () => {
  const f = await raceSetup(); const { skill: skillTable } = await import('../src/db/skill-schema.ts');
  const [magic] = await db.transaction(tx => tx.insert(skillTable).values({ name: 'Spellcraft', classification: 'standard', tier: 1, primaryAttribute: 'INT' }).returning());
  await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,5)', [f.heroId, magic.id]);
  await pool.query('update races set base_magic=20 where id=$1', [f.source.ancestry.id]);
  await pool.query('update campaign_character_profile set base_magic_steps=1 where character_id=$1', [f.heroId]);
  await pool.query("insert into campaign_character_active_mana(character_id,system,mana_spent) values($1,'Spellcraft',3) on conflict(character_id,system) do update set mana_spent=3", [f.heroId]);
  const before = await db.transaction(tx => readActiveManaInTransaction(tx, f.heroId)); await change(f);
  assert.deepEqual(await db.transaction(tx => readActiveManaInTransaction(tx, f.heroId)), before);
  await pool.query('update campaign_character_profile set base_magic_steps=2 where character_id=$1', [f.heroId]);
  assert.equal((await current(f)).profile.baseMagicSteps, 2); await change(f, 'return');
  assert.equal((await one("select mana_spent from campaign_character_active_mana where character_id=$1 and system='Spellcraft'", [f.heroId])).mana_spent, 3);
});

for (const state of ['retained', 'unusable', 'merged', 'dropped']) test(`incoming ${state} equipment: recorded Worn Armor then Form rules then natural Soak, frozen across Return`, async () => {
  const m = emptyRaceFormMechanics(); m.equipment = { state, notes: '' }; m.interactionMode = 'replace'; m.interactionRules = rules('fire', 50);
  m.protectionMode = 'override'; m.protections = [{ key: 'hide', name: 'Form Hide', naturalSoak: 2, coverage: { kind: 'all' }, sortOrder: 0 }];
  const f = await raceSetup(m); await db.transaction(tx => protectionPipelineFixture(tx, f.godId, f.heroId));
  await pool.query('update campaign_character_profile set race_id=$2 where character_id=$1', [f.heroId, f.source.ancestry.id]);
  const normalPlan = incoming(await target(f)), original = structuredClone(normalPlan); const entry = await change(f);
  const formPlan = incoming(await target(f)); assert.equal(formPlan.status, 'resolved'); assert.equal(formPlan.finalEffect.damage, 5); // (20 - (4 + 2)) * .5 - 2
  assert.equal(formPlan.input.target.currentForm.entryEventId, entry.event.id); const frozen = structuredClone(formPlan);
  await change(f, 'return'); assert.deepEqual(formPlan, frozen); assert.deepEqual(normalPlan, original); assert.deepEqual(incoming(await target(f)), normalPlan);
});

for (const state of ['full', 'none', 'limited']) test(`actual equipment mutation owner enforces ${state} manipulation and freezes GOD approval on new actions`, async () => {
  const m = emptyRaceFormMechanics(); m.manipulation = { state, notes: '' }; const f = await raceSetup(m); await change(f);
  const { setStackEquipmentStateInTransaction } = await import('../src/features/items/equipment-state-service.ts');
  const command = { characterId: f.heroId, itemId: f.weaponId, state: 'wielded', quantity: 1 };
  const attempt = () => db.transaction(tx => setStackEquipmentStateInTransaction(tx, command));
  if (state === 'full') await attempt(); else await assert.rejects(attempt(), state === 'none' ? /cannot manipulate/ : /G.O.D./);
  if (state === 'limited') {
    await assert.rejects(db.transaction(tx => capabilities.assertFormEquipmentUseInTransaction(tx, f.heroId, { userId: 'foreign', reason: 'Forged' })), /Campaign-owning/);
    await db.transaction(tx => recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: 'weapon', sourceRef: `stack:${f.weaponId}`, mode: 'manual-god-ruling', governing: null, effectScaling: {}, reason: 'Exact grip approved', useRequirementsReason: 'This claw can hold the Shortsword.' }));
    const draft = { ...completionDraft(f.heroId, f.defenderId), sourceKind: 'weapon', sourceRef: `stack:${f.weaponId}`, weaponItemId: f.weaponId };
    const snapshot = await db.transaction(tx => declarationApi.previewCombatDeclarationInTransaction(tx, f.context, f.player, draft));
    assert.equal(snapshot.authoredSource.authoredData.formEquipment.ruling.authorizedByUserId, f.godId);
    await change(f, 'return'); await change(f);
    await assert.rejects(db.transaction(tx => declarationApi.previewCombatDeclarationInTransaction(tx, f.context, f.player, draft)), /G.O.D./);
  }
});

test('Form temporary Granted link is authoritative possession evidence and disappears on Return', async () => {
  const f = await raceSetup(), m = emptyRaceFormMechanics(); await pool.query("update skill set classification='Special Ability' where id=$1", [f.skillId]); m.skillsMode = 'add'; m.skillLinks = [{ skillId: f.skillId, skillName: '', skillClassification: '', linkType: 'Granted', value: null, sortOrder: 0 }];
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...f.form, mechanics: m }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  const before = await allRows(); await change(f); assert.ok((await current(f)).effective.race.skillLinks.some(row => row.linkType === 'Granted' && row.skillId === f.skillId));
  await change(f, 'return'); assert.equal(await current(f), null); const after = await allRows();
  for (const table of Object.keys(before).filter(name => /character.*(skill|ability)/.test(name))) assert.deepEqual(after[table], before[table]);
});

for (const targetIsForm of [false, true]) test(`completed Form Natural Attack uses Pass 4 Magic; immutable source and target history survives Return (target transformed=${targetIsForm})`, async () => {
  const f = await raceSetup(), m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 20; m.attacksMode = 'override';
  m.attacks = [{ ...f.source.attack, id: undefined, raceId: undefined, authoring: { ...f.source.attack.authoring, magic: { document: magicCompletionDocument(false) } } }];
  await db.transaction(tx => saveRaceFormsInTransaction(tx, f.source.ancestry.id, [{ ...f.form, mechanics: m }], { anatomy: null, naturalAttacks: [], naturalProtections: [] }));
  await change(f); const targetId = targetIsForm ? f.defenderId : f.occurrences[0]; if (targetIsForm) await change({ ...f, heroId: f.defenderId });
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
  const source = (await attacks(f))[0];
  const { resolveDeclaredDefensesInTransaction } = await import('../src/features/tabletop-operations/defense-intervention-service.ts');
  const { generateActionEffectPlanInTransaction, applyRoutineCombatConsequencesInTransaction } = await import('../src/features/tabletop-operations/action-effect-plan-service.ts');
  const { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } = await import('../src/features/tabletop-operations/runtime-integration-service.ts');
  const { advanceInitiativeTimeline } = await import('../src/features/tabletop-operations/initiative-runtime.ts');
  const completed = await db.transaction(async tx => {
    const draft = { ...completionDraft(f.heroId, targetId), sourceKind: 'race-natural-attack', sourceRef: source.ref, sourcePayload: { rangeAttackMode: 'melee', rangeDistance: 5, rangeUnit: 'feet' } };
    const id = await declarationApi.createActionDeclarationDraftInTransaction(tx, f.context, f.player, draft);
    await declarationApi.lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    await declarationApi.commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: 'entered', enteredTotal: 70 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId); await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id)).status, 'applied');
    return { id, planId };
  });
  const planBefore = await one('select * from campaign_session_encounter_effect_plan where id=$1', [completed.planId]);
  const effectsBefore = await rows('select * from campaign_session_encounter_effect where plan_id=$1 order by id', [completed.planId]); assert.equal(effectsBefore.length, 2);
  const sourceBefore = await one('select * from campaign_session_encounter_action_declaration where id=$1', [completed.id]);
  assert.ok(JSON.stringify(sourceBefore).includes(source.ref)); if (targetIsForm) assert.ok(JSON.stringify(effectsBefore).includes('entryEventId'));
  await change(f, 'return'); if (targetIsForm) await change({ ...f, heroId: f.defenderId }, 'return');
  assert.deepEqual(await one('select * from campaign_session_encounter_effect_plan where id=$1', [completed.planId]), planBefore);
  assert.deepEqual(await rows('select * from campaign_session_encounter_effect where plan_id=$1 order by id', [completed.planId]), effectsBefore);
  assert.deepEqual(await one('select * from campaign_session_encounter_action_declaration where id=$1', [completed.id]), sourceBefore);
});


test('learned spell governing Skill uses effective INT while speech none invents no verbal requirement', async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.INT = 20; m.speech = { state: 'none', notes: '' }; const f = await raceSetup(m);
  const { addLearnedCombatSpell } = await import('./fixtures/combat-learned-spell-fixture.ts'); const spell = await db.transaction(tx => addLearnedCombatSpell(tx, f));
  const draft = { ...completionDraft(f.heroId, f.defenderId), sourceKind: 'spell', sourceRef: `catalog:${spell.allocation.id}`, sourcePayload: { selections: { targetGroups: { "bolt-target": [f.defenderId] }, applications: { [`bolt-damage:${f.defenderId}`]: { hitLocationNumber: 0 } } } } };
  const normal = await db.transaction(tx => declarationApi.previewCombatDeclarationInTransaction(tx, f.context, f.player, draft)); await change(f);
  const projected = await db.transaction(tx => declarationApi.previewCombatDeclarationInTransaction(tx, f.context, f.player, draft));
  assert.equal(projected.authoredSource.governingSnapshot.kind, 'skill'); assert.notEqual(projected.authoredSource.governingSnapshot.originalTarget, normal.authoredSource.governingSnapshot.originalTarget);
  assert.equal(projected.authoredSource.authoredData.effectiveFacts.attributes.INT, 80);
});

test('new Encounter initialization uses Form effective DEX without repositioning existing Initiative', async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 20; const f = await raceSetup(m);
  await pool.query("insert into race_movement_modes(race_id,movement_mode,base_value,sort_order) values($1,'Land',4,0)", [f.source.ancestry.id]); await change(f);
  const existing = await rows('select * from campaign_session_encounter_initiative_participant where encounter_id=$1', [f.encounterId]);
  const { resolveInitiativeCapacityInTransaction } = await import('../src/features/tabletop-operations/initiative-capacity-service.ts');
  const capacity = await db.transaction(tx => resolveInitiativeCapacityInTransaction(tx, f.heroId, f.campaignId));
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1", [f.encounterId]);
  const next = await db.transaction(async tx => {
    const [encounter] = await tx.insert(rt.campaignSessionEncounter).values({ campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.sceneId, sequenceNumber: 20, title: 'Already transformed', status: 'active', startedAt: new Date(), encounterType: 'combat' }).returning();
    await tx.insert(rt.campaignSessionEncounterParticipant).values({ campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.sceneId, encounterId: encounter.id, characterId: f.heroId }); return encounter;
  });
  const { initializeEncounterInitiative } = await import('../src/app/heavens/tabletop/initiative-actions.ts'); await actors.run(f.godId, () => initializeEncounterInitiative(next.id));
  const established = await one('select * from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2', [next.id, f.heroId]);
  assert.equal(capacity.dexterity, 70); assert.equal(established.current_initiative, capacity.normalTotalInitiative);
  assert.deepEqual(await rows('select * from campaign_session_encounter_initiative_participant where encounter_id=$1', [f.encounterId]), existing);
});

for (const changed of ['actor', 'target']) test(`distance approval cannot cross ${changed} Form transition even with unchanged attack definition`, async () => {
  const f = await raceSetup(); const { createPlayerCombatRulingRequestInTransaction, ruleOnPlayerCombatRequestInTransaction, assertApprovedNaturalAttackDistanceInTransaction } = await import('../src/features/tabletop-operations/player-combat-ruling-service.ts');
  await pool.query('update race_natural_attacks set authoring_json=$2 where id=$1', [f.source.attack.id, { ...f.source.attack.authoring, mode: 'ranged' }]);
  const ref = (await attacks(f))[0].ref;
  const request = await db.transaction(tx => createPlayerCombatRulingRequestInTransaction(tx, f.context, f.player, { requestType: 'weapon-distance', sourceKind: 'race-natural-attack', sourceRef: ref,
    targetParticipantId: f.defenderId, sourceInstanceId: null, intent: 'Exact distance', blockedReason: 'Confirm distance', idempotencyKey: randomUUID().replaceAll("-", ""), frozenRequest: { distance: 5, unit: 'feet', attackMode: 'ranged' } }));
  await db.transaction(tx => ruleOnPlayerCombatRequestInTransaction(tx, f.context, f.godId, request.requestId, { status: 'approved', response: 'Confirmed', ruling: { distance: 5, unit: 'feet' } }));
  const check = () => db.transaction(tx => assertApprovedNaturalAttackDistanceInTransaction(tx, f.context, f.player, request.requestId, { sourceRef: ref, targetParticipantId: f.defenderId, distance: 5, unit: 'feet' }));
  await check(); await change(changed === 'actor' ? f : { ...f, heroId: f.defenderId }); await assert.rejects(check(), /Form changed|Form transition|Form.*ruling/i);
});

for (const reactionType of ['dodge', 'block', 'parry']) test(`persistent Creature ${reactionType} response uses frozen Form defense and exact Form identity`, async () => {
  const m = emptyCreatureFormMechanics(); m.defenses = { mode: 'override', rows: [{ defenseType: reactionType[0].toUpperCase() + reactionType.slice(1), value: '27', against: '', notes: '', seedIdentity: 'form-defense', sortOrder: 0 }] };
  const f = await creatureSetup(m); const entry = await change(f);
  await pool.query('update campaign_session_encounter_initiative_participant set current_initiative=22 where encounter_id=$1 and character_id=$2', [f.encounterId, f.heroId]);
  await pool.query('update campaign_character set is_npc=true,npc_kind=$2 where id=$1', [f.defenderId, 'race']);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.defenderId]);
  const { previewDefenseInterventionInTransaction, declareDefenseInterventionInTransaction } = await import('../src/features/tabletop-operations/defense-intervention-service.ts');
  const attack = (await db.transaction(tx => readRaceAttackSourcesInTransaction(tx, f.context, f.defenderId)))[0];
  const declared = await db.transaction(async tx => {
    const id = await declarationApi.createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.defenderId, f.heroId), sourceKind: 'race-natural-attack', sourceRef: attack.ref, sourcePayload: { rangeAttackMode: 'melee', rangeDistance: 5, rangeUnit: 'feet' } });
    await declarationApi.lockActionDeclarationInTransaction(tx, f.context, f.god, id); await declarationApi.commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: 'entered', enteredTotal: 70 });
    const [window] = await tx.select().from(rt.campaignSessionEncounterResponderOpportunity).where(and(eq(rt.campaignSessionEncounterResponderOpportunity.declarationId, id), eq(rt.campaignSessionEncounterResponderOpportunity.responderCharacterId, f.heroId)));
    assert.ok(window); await declarationApi.reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: 'allow' });
    const input = { opportunityId: window.id, reactionType, protectedTargetCharacterId: f.heroId, sourceRef: `form:${entry.event.id}:form-defense`, ...(reactionType === 'dodge' ? {} : { initiativeCost: 2, godApprovalReason: 'Exact missing defense timing confirmed.' }) };
    const preview = await previewDefenseInterventionInTransaction(tx, f.context, f.god, input); assert.equal(preview.source.governingSnapshot.originalTarget, 27);
    assert.equal(preview.source.authoredContext.currentForm.entryEventId, entry.event.id);
    return declareDefenseInterventionInTransaction(tx, f.context, f.god, input, { method: 'entered', enteredTotal: 80 });
  });
  assert.ok(declared);
});

test('active DEX and movement Modifiers apply once after the effective Form base and survive Return', async () => {
  const m = emptyRaceFormMechanics(); m.attributeAdjustments.DEX = 20; const f = await raceSetup(m);
  await pool.query("insert into race_movement_modes(race_id,movement_mode,base_value,sort_order) values($1,'Land',4,0)", [f.source.ancestry.id]);
  await pool.query("insert into campaign_character_active_modifier(character_id,label,modifier_channel,target_key,amount,source_kind,source_id,source_name,duration_kind,duration_label) values($1,'DEX modifier','attribute','DEX',5,'god','fixture','Fixture','until-removed','Until removed'),($1,'Movement modifier','movement','movement:Land',2,'god','fixture','Fixture','until-removed','Until removed')", [f.heroId]);
  const stored = await rows('select * from campaign_character_active_modifier where character_id=$1 order by id', [f.heroId]);
  const normal = await db.transaction(tx => resolveInitiativeCapacityOptionsInTransaction(tx, f.heroId, f.campaignId)); await change(f);
  const form = await db.transaction(tx => resolveInitiativeCapacityOptionsInTransaction(tx, f.heroId, f.campaignId));
  assert.equal(form.dexterity, 75); assert.equal(form.movementModes[0].baseMovement, normal.movementModes[0].baseMovement);
  assert.deepEqual(await db.transaction(tx => resolveInitiativeCapacityOptionsInTransaction(tx, f.heroId, f.campaignId)), form);
  await change(f, 'return'); assert.deepEqual(await db.transaction(tx => resolveInitiativeCapacityOptionsInTransaction(tx, f.heroId, f.campaignId)), normal);
  assert.deepEqual(await rows('select * from campaign_character_active_modifier where character_id=$1 order by id', [f.heroId]), stored);
});

async function physicalRuling(f, sourceKind, sourceRef) {
  return db.transaction(tx => recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind, sourceRef,
    mode: 'manual-god-ruling', governing: null, effectScaling: {}, reason: 'This exact grip is usable.', useRequirementsReason: 'This exact grip is usable.' }));
}
async function advanceHalfStep(f) {
  const { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } = await import('../src/features/tabletop-operations/runtime-integration-service.ts');
  const { advanceInitiativeTimeline } = await import('../src/features/tabletop-operations/initiative-runtime.ts');
  await db.transaction(async tx => { const before = await loadInitiativeEngineInTransaction(tx, f.encounterId); await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, before.runtime.timelineInitiative - 0.5)); });
}

test('GOD approves Player melee draw without choosing it; pending completion freezes the Form ruling and retries once', async () => {
  const m = emptyRaceFormMechanics(); m.manipulation = { state: 'limited', notes: '' }; const f = await raceSetup(m); await change(f);
  await pool.query('delete from campaign_character_item_equipment_state where character_id=$1 and item_id=$2', [f.heroId, f.weaponId]);
  await pool.query('update weapon_profiles set draw_initiative_cost=0.5 where item_id=$1', [f.weaponId]);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
  const { startMeleeDraw } = await import('../src/features/tabletop-operations/combat-melee-draw-service.ts');
  const command = { characterId: f.heroId, itemId: f.weaponId, instanceId: null, requestKey: randomUUID() };
  const start = actor => db.transaction(tx => startMeleeDraw(tx, f.context, actor, command));
  await assert.rejects(start(f.player), /G.O.D./); await physicalRuling(f, 'weapon', `stack:${f.weaponId}`);
  await assert.rejects(start(f.god), /own action choice/); const receipt = await start(f.player); await advanceHalfStep(f);
  const declared = await one('select * from campaign_session_encounter_action_declaration where id=$1', [receipt.declarationId]);
  assert.equal(declared.status, 'resolved'); assert.equal(declared.draft_json.sourcePayload.formEquipment.ruling.authorizedByUserId, f.godId);
  assert.deepEqual(await start(f.player), receipt);
});

test('exact Player inventory operation requires a GOD Form ruling, completes with frozen evidence, and cannot cross entries', async () => {
  const m = emptyRaceFormMechanics(); m.equipment = { state: 'custom', notes: '' }; const f = await raceSetup(m); await change(f);
  const item = await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis) values($1,'Form case','equipment','general','Item','Fixture','Fixture','unit') returning id", [`FORM-CASE-${randomUUID()}`.toUpperCase()]);
  await pool.query("insert into container_profiles(item_id,closure_mode,open_initiative_cost,close_initiative_cost) values($1,'open-close',0.5,0.5)", [item.id]);
  const copy = await one('insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,0,0) returning id', [f.heroId, item.id]);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
  const version = (await one('select commerce_version from campaign_character_profile where character_id=$1', [f.heroId])).commerce_version;
  const command = { characterId: f.heroId, expectedCommerceVersion: version, operation: 'open', itemId: item.id, instanceId: copy.id, quantity: 1, containerInstanceId: null, requestKey: randomUUID().replaceAll('-', '') };
  const { inventoryFormOperationRef } = await import('../src/features/forms/form-equipment-operation.ts');
  const { startCombatInventory } = await import('../src/features/tabletop-operations/combat-inventory-service.ts');
  const start = input => db.transaction(tx => startCombatInventory(tx, f.context, f.player, input));
  await assert.rejects(start(command), /G.O.D./); await physicalRuling(f, 'equipment-operation', inventoryFormOperationRef(command));
  await assert.rejects(start({ ...command, operation: 'close' }), /G.O.D./);
  const receipt = await start(command); await advanceHalfStep(f);
  const declared = await one('select * from campaign_session_encounter_action_declaration where id=$1', [receipt.declarationId]);
  assert.equal(declared.status, 'resolved'); assert.equal(declared.draft_json.sourcePayload.formEquipment.ruling.authorizedByUserId, f.godId);
  assert.equal((await one('select state from inventory_container_access where instance_id=$1', [copy.id])).state, 'open');
  assert.deepEqual(await start(command), receipt);
  await change(f, 'return'); await change(f);
  assert.equal(await db.transaction(tx => capabilities.readFormEquipmentApprovalInTransaction(tx, f.encounterId, f.heroId, 'equipment-operation', inventoryFormOperationRef(command))), null);
});
