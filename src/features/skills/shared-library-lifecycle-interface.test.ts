import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const libraries = [
  {
    entity: "Race",
    table: "race",
    kind: "race",
    actions: source("src/app/heavens/races/actions.ts"),
    workspace: source("src/app/heavens/races/race-workspace.tsx"),
  },
  {
    entity: "Creature",
    table: "creature",
    kind: "creature",
    actions: source("src/app/heavens/creatures/actions.ts"),
    workspace: source("src/app/heavens/creatures/creature-workspace.tsx"),
  },
  {
    entity: "Item",
    table: "item",
    kind: "item",
    actions: source("src/app/heavens/items/actions.ts"),
    workspace: source("src/app/heavens/items/item-workspace.tsx"),
  },
  {
    entity: "DerivedAbility",
    table: "derivedAbility",
    kind: "derived-ability",
    actions: source("src/app/heavens/derived-abilities/actions.ts"),
    workspace: source("src/app/heavens/derived-abilities/derived-ability-workspace.tsx"),
  },
  {
    entity: "Skill",
    table: "skill",
    kind: "skill",
    actions: source("src/app/heavens/skills/actions.ts"),
    workspace: [
      source("src/app/heavens/skills/skills-workspace.tsx"),
      source("src/app/heavens/skills/skill-library.tsx"),
      source("src/app/heavens/skills/skill-editor.tsx"),
    ].join("\n"),
  },
] as const;

test("shared master-content libraries default to active records and expose an explicit archive view", () => {
  for (const library of libraries) {
    assert.match(library.actions, /archived\?: boolean/);
    assert.match(library.actions, new RegExp(`filters\\.archived \\? isNotNull\\(${library.table}\\.archivedAt\\) : isNull\\(${library.table}\\.archivedAt\\)`));
    assert.match(library.workspace, />\s*Active\s*<\/button>/);
    assert.match(library.workspace, />\s*Archived\s*<\/button>/);
    assert.match(library.workspace, /preserveScroll\(\(\) => load(?:Library|List)\(filters\)\)/);
  }
});

test("each aggregate and lightweight row carry lifecycle metadata", () => {
  for (const library of libraries) {
    assert.match(library.actions, /createdByUserId: string \| null/);
    assert.match(library.actions, /archivedAt: string \| null/);
    assert.match(library.actions, /archiveReason: string/);
    assert.match(library.workspace, /archiveReason/);
    assert.match(library.workspace, /skill-library__row-status/);
  }
});

test("all five authoring surfaces use guarded lifecycle controls instead of direct delete actions", () => {
  for (const library of libraries) {
    assert.match(library.workspace, /<LifecycleControls/);
    assert.match(library.workspace, new RegExp(`entityKind: "${library.kind}"`));
    assert.match(library.workspace, /disabled=\{saving \|\| dirty\}/);
    assert.match(library.workspace, /lifecycle-editor-fields/);
    assert.doesNotMatch(library.actions, new RegExp(`export async function delete${library.entity}`));
  }
});

test("normal shared-library candidates omit archived roots while stored references remain loadable", () => {
  const races = libraries[0]!.actions;
  const creatures = libraries[1]!.actions;
  const items = libraries[2]!.actions;
  const abilities = libraries[3]!.actions;
  const skills = libraries[4]!.actions;

  assert.match(races, /conditions\.push\(isNull\(skill\.archivedAt\)\)/);
  assert.match(creatures, /const conditions: SQL\[\] = \[isNull\(skill\.archivedAt\)\]/);
  assert.match(items, /preservedSkillIds/);
  assert.match(items, /candidate\.archivedAt === null \|\| preservedSkillIds\.has/);
  assert.match(items, /const conditions: SQL\[\] = \[isNull\(item\.archivedAt\)\]/);
  assert.match(items, /const conditions: SQL\[\] = \[isNull\(creature\.archivedAt\)\]/);
  assert.match(abilities, /storedSkillIds/);
  assert.match(abilities, /storedAbilityIds/);
  assert.match(skills, /isNull\(skill\.archivedAt\)/);
  assert.match(skills, /previouslyRelatedSkillIds/);
});
