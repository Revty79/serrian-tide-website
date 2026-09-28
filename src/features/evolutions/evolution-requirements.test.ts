import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyEvolutionRequirement as empty, evaluateEvolutionGroups, normalizeEvolutionRequirements, type EvolutionFactContext, type EvolutionRequirement } from "./evolution-requirements";
import { evaluateEvolutionRequirements } from "../creatures/evolution-requirements";
import { creatureDraftFixture, creatureFormFixture } from "../../../scripts/creature-form-fixture";

const facts = (): EvolutionFactContext => ({ owner: "race", age: 19, currentExperience: 7, totalExperience: 42,
  context: { owner: "race", attributes: {}, skillPoints: new Map([[10, 5]]), possessedSkillIds: new Set([10,11]), possessedDerivedAbilityIds: new Set([20]) },
  forms: [], ownerPresent: false, ownerItemIds: null, individualItemIds: new Set([30]), conditionNames: ["  Moon   Blessed "] });
const row = (type: EvolutionRequirement["requirementType"], patch: Partial<EvolutionRequirement> = {}): EvolutionRequirement => ({ ...empty(type, 0, type), ...patch });
const run = (rows: EvolutionRequirement[], value = facts()) => evaluateEvolutionGroups({ mode: "requirements", requirements: rows }, value);

test("explicit modes and malformed/cross-owner definitions fail closed", () => {
  assert.equal(evaluateEvolutionGroups({mode:"unrestricted",requirements:[]},facts()).status,"eligible");
  for (const input of [{mode:"requirements",requirements:[]}, {mode:"unrestricted",requirements:[row("age")]}, {mode:"guess",requirements:[]}]) assert.equal(evaluateEvolutionGroups(input as never,facts()).status,"not-eligible");
  for(const invalid of [row("age",{requiredValue:NaN}),row("age",{operator:"possessed"}),row("manual"),row("skill",{skillId:0}),row("item",{itemId:30,itemHolder:"owner"}),row("creature-ability",{creatureAbilityCanonicalId:"A"}),row("form-access",{creatureFormKey:"wolf"}),row("condition",{conditionName:"ok",itemId:30})]) assert.throws(()=>normalizeEvolutionRequirements({mode:"requirements",requirements:[invalid]},"race"));
  assert.throws(()=>normalizeEvolutionRequirements({mode:"requirements",requirements:[row("derived-ability",{derivedAbilityId:20})]},"creature"));
  assert.throws(()=>normalizeEvolutionRequirements({mode:"requirements",requirements:[row("skill",{skillId:10,operator:"gte",requiredValue:1})]},"creature"));
});

test("AND failures dominate manual; OR passing alternatives dominate manual and failures",()=>{
  const age=row("age",{requiredValue:20}), manual=row("manual",{sortOrder:1,notes:"G.O.D. must confirm the quest"});
  assert.equal(run([age,manual]).status,"not-eligible");
  assert.equal(run([{...age,requiredValue:18},manual]).status,"god-review");
  assert.equal(run([age,manual,row("total-experience",{groupNumber:1,requiredValue:40})]).status,"eligible");
  assert.equal(run([age,{...manual,groupNumber:1,sortOrder:0}]).status,"god-review");
});

test("all numeric operators use separate saved age/current/total fields; unknown is review",()=>{
  for(const [operator,threshold,expected] of [["gte",19,true],["gt",19,false],["lte",19,true],["lt",19,false],["eq",19,true],["neq",19,false]] as const) assert.equal(run([row("age",{operator,requiredValue:threshold})]).status,expected?"eligible":"not-eligible");
  assert.equal(run([row("age")],{...facts(),age:null}).status,"god-review");
  assert.equal(run([row("current-experience",{requiredValue:20})]).status,"not-eligible");
  assert.equal(run([row("total-experience",{requiredValue:20})]).status,"eligible");
});

test("Race possession, purchased Skill points, Derived Abilities, exact Items and normalized conditions",()=>{
  for(const requirement of [row("skill",{skillId:11}),row("skill",{skillId:10,operator:"gte",requiredValue:5}),row("derived-ability",{derivedAbilityId:20}),row("item",{itemId:30,itemHolder:"character"}),row("condition",{conditionName:"moon blessed"}),row("condition",{conditionName:"burning",operator:"not-possessed"})]) assert.equal(run([requirement]).status,"eligible");
  assert.equal(run([row("skill",{skillId:11,operator:"gt",requiredValue:0})]).status,"not-eligible","a racial grant is not purchased points");
  assert.equal(run([row("item",{itemId:31,itemHolder:"character"})]).status,"not-eligible");
  assert.equal(run([row("item",{itemId:30,itemHolder:"character"})],{...facts(),individualItemIds:null}).status,"god-review");
});

test("manual categories stay review; archives block even unrestricted; exact Form Access reused",()=>{
  for(const manualCategory of ["god-approval","story-event","milestone","environment","current-form","custom"] as const) assert.equal(run([row("manual",{manualCategory,notes:"Confirm this condition"})]).status,"god-review");
  assert.equal(evaluateEvolutionGroups({mode:"unrestricted",requirements:[]},{...facts(),unavailable:true}).status,"not-eligible");
  const value={...facts(),forms:[{key:"ascended",access:{mode:"unrestricted" as const,requirements:[]}}]};
  const before=structuredClone(value);
  assert.equal(run([row("form-access",{raceFormKey:"ascended"})],value).status,"eligible");
  assert.equal(run([row("form-access",{raceFormKey:"other"})],value).status,"not-eligible");
  assert.deepEqual(value,before);
});

test("Creature exact current snapshot, Skill and Ability identity, Forms and owner scope",()=>{
  const form = creatureFormFixture();
  const snapshot={...creatureDraftFixture(),id:101, abilities: form.mechanics.abilities.rows, forms: [form]};
  const path={id:1,version:1,sourceCreatureId:101,destinationCreatureId:102,destinationArchived:false};
  const value={sourceCreatureId:101,snapshot,age:3,currentExperience:2,totalExperience:15,ownerPresent:true,creatureItemIds:new Set([30]),ownerItemIds:new Set([31]),conditionNames:[]};
  const check=(requirements:EvolutionRequirement[])=>evaluateEvolutionRequirements(path,{mode:"requirements",requirements},value);
  const ability=row("creature-ability",{creatureAbilityCanonicalId:snapshot.abilities[0].canonicalId});
  assert.equal(check([ability]).status,"eligible");
  snapshot.abilities=[];assert.equal(check([ability]).status,"not-eligible");
  snapshot.skillLinks=[{skillId:10,skillName:"Tracking",rank:"99",skillClassification:"Physical",notes:"",sortOrder:0}];
  assert.equal(check([row("skill",{skillId:10})]).status,"eligible");
  assert.equal(check([row("skill",{skillId:11})]).status,"not-eligible");
  assert.equal(check([row("item",{itemId:31,itemHolder:"owner"})]).status,"eligible");
  value.ownerPresent=false;assert.equal(check([row("item",{itemId:31,itemHolder:"owner"})]).status,"not-eligible");
  snapshot.forms=[{...creatureFormFixture(),creatureId:101,access:{mode:"unrestricted",requirements:[]}}];
  const before=structuredClone(value);
  assert.equal(check([row("form-access",{creatureFormKey:snapshot.forms[0].key})]).status,"eligible");
  assert.deepEqual(value,before);
  assert.throws(()=>evaluateEvolutionRequirements({...path,sourceCreatureId:999},{mode:"unrestricted",requirements:[]},value),/current Creature/);
});
