import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAMPAIGN_GRAPH_DELETE_STEPS,
  CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS,
} from "./campaign-delete-plan";

type SnapshotForeignKey = {
  tableTo: string;
  columnsFrom: string[];
};

type SnapshotTable = {
  columns: Record<string, { notNull?: boolean }>;
  foreignKeys: Record<string, SnapshotForeignKey>;
};

const snapshot = JSON.parse(
  readFileSync("drizzle/meta/0032_snapshot.json", "utf8"),
) as { tables: Record<string, SnapshotTable> };

function campaignOwnedClosure(): Set<string> {
  const owned = new Set<string>(["campaign"]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [qualifiedName, table] of Object.entries(snapshot.tables)) {
      const tableName = qualifiedName.replace(/^public\./, "");
      if (owned.has(tableName)) continue;
      if (Object.values(table.foreignKeys ?? {}).some((foreignKey) => (
        owned.has(foreignKey.tableTo)
      ))) {
        owned.add(tableName);
        changed = true;
      }
    }
  }
  owned.delete("campaign");
  return owned;
}

test("the explicit Campaign delete plan covers the complete owned FK closure", () => {
  const planned = CAMPAIGN_GRAPH_DELETE_STEPS.map(({ tableName }) => tableName);
  assert.equal(new Set(planned).size, planned.length, "delete plan contains duplicate tables");
  assert.deepEqual([...planned].sort(), [...campaignOwnedClosure()].sort());
});

test("every cross-table Campaign FK is deleted child before parent", () => {
  const position = new Map<string, number>(
    CAMPAIGN_GRAPH_DELETE_STEPS.map(({ tableName }, index) => [tableName, index]),
  );
  position.set("campaign", CAMPAIGN_GRAPH_DELETE_STEPS.length);

  for (const childName of campaignOwnedClosure()) {
    const child = snapshot.tables[`public.${childName}`];
    for (const foreignKey of Object.values(child.foreignKeys ?? {})) {
      if (foreignKey.tableTo === childName || !position.has(foreignKey.tableTo)) continue;
      assert.ok(
        (position.get(childName) ?? Infinity) < (position.get(foreignKey.tableTo) ?? -1),
        `${childName} must be removed before ${foreignKey.tableTo}`,
      );
    }
  }
});

test("delete scopes match a trusted Campaign predicate", () => {
  for (const step of CAMPAIGN_GRAPH_DELETE_STEPS) {
    const table = snapshot.tables[`public.${step.tableName}`];
    if (step.scope === "campaign") {
      assert.ok(table.columns.campaign_id, `${step.tableName} lacks campaign_id`);
    } else if (step.scope === "character") {
      assert.ok(table.columns.character_id, `${step.tableName} lacks character_id`);
    } else {
      assert.ok(table.columns.room_id, `${step.tableName} lacks room_id`);
    }
  }
});

test("every Campaign-owned nullable self-reference has an explicit break step", () => {
  const configured = new Set<string>(
    CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS.map(
      ({ tableName, columnName }) => `${tableName}.${columnName}`,
    ),
  );
  for (const tableName of campaignOwnedClosure()) {
    const table = snapshot.tables[`public.${tableName}`];
    for (const foreignKey of Object.values(table.foreignKeys ?? {})) {
      if (foreignKey.tableTo !== tableName) continue;
      for (const columnName of foreignKey.columnsFrom) {
        if (table.columns[columnName]?.notNull) continue;
        assert.ok(
          configured.has(`${tableName}.${columnName}`),
          `self-reference ${tableName}.${columnName} is not detached`,
        );
      }
    }
  }
});

test("the Campaign graph plan never includes users, shared libraries, or lifecycle audit", () => {
  const planned = new Set<string>(CAMPAIGN_GRAPH_DELETE_STEPS.map(({ tableName }) => tableName));
  for (const protectedTable of [
    "user",
    "races",
    "creatures",
    "skill",
    "items",
    "derived_ability",
    "lifecycle_audit_event",
  ]) {
    assert.equal(planned.has(protectedTable), false, protectedTable);
  }
});
