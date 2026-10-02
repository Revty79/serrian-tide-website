import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { currentMigrationSnapshotName } from "../../../scripts/current-migration-snapshot";

import {
  CAMPAIGN_GRAPH_DELETE_STEPS,
  CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS,
} from "./campaign-delete-plan";

type SnapshotForeignKey = {
  tableTo: string;
  columnsFrom: string[];
  onDelete?: string;
};

type SnapshotTable = {
  columns: Record<string, { notNull?: boolean }>;
  foreignKeys: Record<string, SnapshotForeignKey>;
};

const snapshot = JSON.parse(
  readFileSync(`drizzle/meta/${currentMigrationSnapshotName()}`, "utf8"),
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
      if (foreignKey.columnsFrom.every(column => !child.columns[column]?.notNull && CAMPAIGN_GRAPH_SELF_REFERENCE_BREAKS.some(reference => reference.tableName === childName && reference.columnName === column))) continue;
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
    } else if (step.scope === "chat-room") {
      assert.ok(table.columns.room_id, `${step.tableName} lacks room_id`);
    } else if (step.scope === "shop-request" || step.scope === "source-use-request") {
      assert.ok(table.columns.request_id, `${step.tableName} lacks request_id`);
    } else if (step.scope === "encounter") {
      assert.ok(table.columns.encounter_id, `${step.tableName} lacks encounter_id`);
    } else {
      assert.ok(table.columns.transaction_id, `${step.tableName} lacks transaction_id`);
    }
  }
});

test("Campaign Skill exclusions retain Campaign cascade and restrictive Skill ownership", () => {
  const exclusions = snapshot.tables["public.campaign_skill_exclusion"];
  const foreignKeys = Object.values(exclusions.foreignKeys);
  assert.equal(foreignKeys.find(({ tableTo }) => tableTo === "campaign")?.onDelete, "cascade");
  assert.equal(foreignKeys.find(({ tableTo }) => tableTo === "skill")?.onDelete, "restrict");
  assert.deepEqual(CAMPAIGN_GRAPH_DELETE_STEPS.find(({ tableName }) => tableName === "campaign_skill_exclusion"), {
    tableName: "campaign_skill_exclusion", scope: "campaign",
  });
});

test("every Campaign-owned nullable self-reference has an explicit deletion strategy", () => {
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
        if (["race_evolution_events", "creature_evolution_events"].includes(tableName) && columnName === "reverses_event_id") {
          // Immutable Return provenance cannot be detached. The trigger enforces the
          // same Campaign, and NO ACTION permits deleting both rows in one statement.
          assert.equal(foreignKey.onDelete, "no action");
          assert.ok(CAMPAIGN_GRAPH_DELETE_STEPS.some(step => step.tableName === tableName && step.scope === "campaign"));
          assert.equal(configured.has(`${tableName}.${columnName}`), false);
          continue;
        }
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
