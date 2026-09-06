import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

test("appearance persistence is a constrained singleton at migration 0037", () => {
  const schema = read("src/db/appearance-schema.ts");
  const migration = read("drizzle/0037_site_appearance.sql");
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  assert.match(schema, /siteAppearanceSetting/);
  assert.match(migration, /CREATE TABLE "site_appearance_setting"/);
  assert.match(migration, /site_appearance_singleton_key/);
  assert.match(migration, /site_appearance_preset_valid/);
  assert.equal(journal.entries.length, 38);
  assert.equal(journal.entries[37]?.idx, 37);
  assert.equal(journal.entries[37]?.tag, "0037_site_appearance");
});

test("every appearance mutation performs fresh administrator authorization and cache expiry", () => {
  const actions = read("src/app/admin/appearance/actions.ts");
  assert.match(actions, /const session = await requireAdmin\(\)/);
  assert.ok(actions.indexOf("requireAdmin()") < actions.indexOf("parseSiteAppearance("));
  assert.match(actions, /updateTag\(APPEARANCE_CACHE_TAG\)/);
});

test("the root renders public appearance values in the initial response with a safe fallback", () => {
  const layout = read("src/app/layout.tsx");
  const service = read("src/features/appearance/appearance-service.ts");
  assert.match(layout, /await getPublicSiteAppearance\(\)/);
  assert.match(layout, /style=\{themeStyle\}/);
  assert.match(layout, /data-appearance-preset/);
  assert.match(service, /unstable_cache/);
  assert.match(service, /catch \{[\s\S]*return DEFAULT_APPEARANCE/);
});

test("Admin exposes Appearance and the editor keeps drafts preview-scoped", () => {
  const dashboard = read("src/app/admin/page.tsx");
  const workspace = read("src/app/admin/appearance/appearance-workspace.tsx");
  assert.match(dashboard, /href: "\/admin\/appearance"/);
  assert.match(workspace, /Immediate preview/);
  assert.match(workspace, /Cancel changes/);
  assert.match(workspace, /Restore preset defaults/);
  assert.match(workspace, /style=\{previewStyle\(draft\)\}/);
  assert.ok(workspace.indexOf("saveAppearanceAction(draft)") < workspace.indexOf("document.documentElement.style.setProperty"));
});

test("every color-bearing application stylesheet consumes the shared semantic theme", () => {
  const stylesheets = filesBelow("src/app").filter((path) => path.endsWith(".css"));
  const structuralOnly = new Set([
    join("src", "app", "access", "access.module.css"),
    join("src", "app", "characters", "printable-character-sheet.css"),
  ]);
  for (const path of stylesheets) {
    if (structuralOnly.has(path)) continue;
    assert.match(read(path), /var\(--st-/, `${path} does not consume the shared appearance variables.`);
  }

  const screenCss = stylesheets
    .filter((path) => !path.endsWith("globals.css") && !path.endsWith("printable-character-sheet.css"))
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    screenCss,
    /#(?:8b5cf6|a855f7|c084fc|fde68a|f5ca73|fbbf24)|rgb\(?(?:139[ ,]+92[ ,]+246|168[ ,]+85[ ,]+247|192[ ,]+132[ ,]+252|245[ ,]+202[ ,]+115|251[ ,]+191[ ,]+36|253[ ,]+230[ ,]+138)/i,
    "A screen still hard-codes a legacy purple or gold brand color instead of the shared theme.",
  );
});
