import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(
  "src/features/skills/skill-framework-reference-service.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const characterWriterSource = readFileSync(
  "src/app/characters/spell-actions.ts",
  "utf8",
).replaceAll("\r\n", "\n");
const skillWriterSource = readFileSync(
  "src/app/heavens/skills/actions.ts",
  "utf8",
).replaceAll("\r\n", "\n");

function actionBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

test("framework validation locks the active target and eligible parent path", () => {
  assert.match(serviceSource, /where candidate\.id = \$\{frameworkSkillId\}[\s\S]*for key share of candidate/);
  assert.match(serviceSource, /candidate\.archived_at/);
  assert.match(serviceSource, /identity\.tier !== undefined/);
  assert.match(serviceSource, /relationship\.relationship_type = 'parent'/);
  assert.match(serviceSource, /parent\.archived_at is null/);
  assert.match(serviceSource, /for key share of relationship, parent/);
  assert.match(serviceSource, /Skill no longer exists/);
  assert.match(serviceSource, /Skill is archived/);
  assert.match(serviceSource, /no longer attached to the required Skill tree/);
});

test("Character spell JSON validation and locking share the write transaction", () => {
  const block = actionBlock(
    characterWriterSource,
    "export async function saveCharacterSpell",
    "export async function setCharacterSpellbookStatus",
  );
  const transaction = block.indexOf("db.transaction");
  const lock = block.indexOf("lockSpellFrameworkSkillReferenceInTransaction");
  const write = block.indexOf("documentJson: JSON.stringify(document)");
  assert.ok(transaction >= 0 && lock > transaction && write > lock);
});

test("spell-construction extension validation and locking share the Skill write transaction", () => {
  const start = skillWriterSource.indexOf("export async function saveSkill");
  assert.ok(start >= 0, "saveSkill must exist");
  const block = skillWriterSource.slice(start);
  const transaction = block.indexOf("db.transaction");
  const lock = block.indexOf("lockSpellFrameworkSkillReferenceInTransaction", transaction);
  const extensionWrite = block.indexOf(".insert(\n              skillExtension", lock);
  assert.ok(transaction >= 0 && lock > transaction && extensionWrite > lock);
  assert.doesNotMatch(
    block.slice(0, transaction),
    /await querySpellFrameworkSkills/,
    "pre-transaction selector validation must not be treated as authoritative",
  );
});
