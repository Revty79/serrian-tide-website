import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const scriptFiles = readdirSync("scripts", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => `scripts/${entry.name}`)
  .sort();

const preMigrationBackfillFixture = "scripts/lifecycle-migration-db.test.ts";

function namedProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((property) => (
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
    && property.name.getText().replaceAll(/["']/g, "") === name
  ));
}

function drizzleCharacterFixtureRows(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const rows: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "values"
      && ts.isCallExpression(node.expression.expression)
      && ts.isPropertyAccessExpression(node.expression.expression.expression)
      && node.expression.expression.expression.name.text === "insert"
      && node.expression.expression.arguments[0]?.getText(sourceFile) === "campaignCharacter"
    ) {
      const values = node.arguments[0];
      if (values && ts.isObjectLiteralExpression(values)) rows.push(values);
      if (values && ts.isArrayLiteralExpression(values)) {
        rows.push(...values.elements.filter(ts.isObjectLiteralExpression));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return rows;
}

function splitSqlValues(input: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (character === "'") {
      if (quoted && input[index + 1] === "'") {
        current += "''";
        index += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  values.push(current.trim());
  return values;
}

test("Drizzle NPC persistence fixtures always provide a compatible detailed build mode", () => {
  let checkedNpcRows = 0;
  for (const path of scriptFiles) {
    const text = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    for (const row of drizzleCharacterFixtureRows(sourceFile)) {
      const isNpc = namedProperty(row, "isNpc");
      if (!isNpc || (ts.isPropertyAssignment(isNpc) && isNpc.initializer.kind === ts.SyntaxKind.FalseKeyword)) {
        continue;
      }
      checkedNpcRows += 1;
      const buildMode = namedProperty(row, "npcBuildMode");
      assert.ok(buildMode, `${path} has a potentially-NPC campaignCharacter fixture without npcBuildMode.`);
      assert.match(
        buildMode.getText(sourceFile),
        /"detailed"/,
        `${path} must persist potentially-NPC fixtures as detailed builds.`,
      );
    }
  }
  assert.ok(checkedNpcRows >= 10, "The audit must inspect the established Drizzle NPC fixtures.");
});

test("raw SQL NPC fixtures include npc_build_mode in the same insert", () => {
  let checkedNpcRows = 0;
  const insertPattern = /insert\s+into\s+campaign_character\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gim;
  for (const path of scriptFiles) {
    const text = readFileSync(path, "utf8");
    if (path === preMigrationBackfillFixture) {
      // This isolated clean-room fixture is intentionally inserted before 0032
      // so the migration's legacy-NPC backfill is exercised rather than bypassed.
      continue;
    }
    for (const match of text.matchAll(insertPattern)) {
      const columns = match[1]!.split(",").map((column) => column.trim().toLowerCase());
      const isNpcIndex = columns.indexOf("is_npc");
      if (isNpcIndex === -1) continue;
      checkedNpcRows += 1;
      const buildModeIndex = columns.indexOf("npc_build_mode");
      assert.notEqual(buildModeIndex, -1, `${path} inserts is_npc without npc_build_mode.`);
      const values = splitSqlValues(match[2]!);
      if (values[isNpcIndex]?.toLowerCase() === "true") {
        assert.equal(
          values[buildModeIndex]?.toLowerCase(),
          "'detailed'",
          `${path} must pair a true is_npc value with detailed npc_build_mode.`,
        );
      }
    }
  }
  assert.ok(checkedNpcRows >= 5, "The audit must inspect the established raw SQL NPC fixtures.");
});

test("the only legacy null-mode NPC fixture proves migration 0032 backfills it", () => {
  const fixture = readFileSync(preMigrationBackfillFixture, "utf8");
  assert.match(
    fixture,
    /insert into campaign_character \(campaign_id, player_user_id, name, is_npc, npc_kind\)/,
  );
  assert.match(fixture, /\{ is_npc: true, npc_build_mode: "detailed" \}/);
  assert.match(
    fixture,
    /await migrate\(drizzle\(targetPool\), \{ migrationsFolder: migrationRoot \}\)/,
  );
});

test("migration 0032 repairs current NPC rows before enforcing fresh-fixture validity", () => {
  const migration = readFileSync("drizzle/0032_safe_entity_lifecycles.sql", "utf8");
  const backfill = migration.indexOf(`UPDATE "campaign_character"\nSET "npc_build_mode" = 'detailed'`);
  const presenceConstraint = migration.indexOf(
    `ADD CONSTRAINT "campaign_character_npc_build_mode_presence"`,
  );
  assert.notEqual(backfill, -1);
  assert.notEqual(presenceConstraint, -1);
  assert.ok(backfill < presenceConstraint);
  assert.match(migration, /WHERE "is_npc" = true AND "npc_build_mode" IS NULL/);
});
