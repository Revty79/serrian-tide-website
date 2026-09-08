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
  assert.equal(journal.entries.length, 43);
  assert.equal(journal.entries[37]?.idx, 37);
  assert.equal(journal.entries[37]?.tag, "0037_site_appearance");
  assert.equal(journal.entries[38]?.tag, "0038_tabletop_location_placement");
  assert.equal(journal.entries[39]?.tag, "0039_tabletop_shop_visits");
  assert.equal(journal.entries[40]?.tag, "0040_tabletop_shop_transactions");
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
  assert.match(workspace, /data-appearance-theme-scope/);
  assert.match(
    read("src/app/globals.css"),
    /:root,\s*\[data-appearance-theme-scope\]\s*\{[\s\S]*?--st-input:[\s\S]*?--st-brand-gradient:/,
  );
  assert.ok(workspace.indexOf("saveAppearanceAction(draft)") < workspace.indexOf("document.documentElement.style.setProperty"));
});

test("screen styles contain no independent color palettes", () => {
  const stylesheets = filesBelow("src").filter((path) => path.endsWith(".css"));
  const structuralOnly = new Set([
    join("src", "app", "access", "access.module.css"),
  ]);
  const intentionalExceptions = new Set([
    join("src", "app", "globals.css"),
    join("src", "app", "characters", "printable-character-sheet.css"),
  ]);
  for (const path of stylesheets) {
    if (structuralOnly.has(path) || intentionalExceptions.has(path)) continue;
    assert.match(read(path), /var\(--st-/, `${path} does not consume the shared appearance variables.`);
  }

  const screenCss = stylesheets
    .filter((path) => !intentionalExceptions.has(path))
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    screenCss,
    /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
    "A screen still contains a literal color instead of a shared semantic variable.",
  );
  assert.doesNotMatch(
    screenCss,
    /(?<![-\w])(?:black|white|red|blue|green|yellow|purple|orange|pink|gray|grey)(?![-\w])/i,
    "A screen still contains a named literal color instead of a shared semantic variable.",
  );

  const componentSources = filesBelow("src/app")
    .filter((path) => /\.(?:[jt]sx?)$/.test(path))
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    componentSources,
    /(?:bg|text|border|shadow|from|via|to)-\[(?:#|rgba?\(|hsla?\()/i,
    "A component still uses a hard-coded Tailwind color utility.",
  );
  assert.doesNotMatch(
    componentSources,
    /(?:color|background|backgroundColor|borderColor|boxShadow)\s*:\s*["'](?:#|rgba?\(|hsla?\()/i,
    "A component still uses an inline literal appearance color.",
  );

  const globalStyles = read("src/app/globals.css");
  for (const mapping of [
    "--color-red-500: var(--st-danger)",
    "--color-emerald-300: var(--st-success)",
    "--color-orange-300: var(--st-warning)",
    "--color-teal-950: var(--st-primary-deep)",
  ]) {
    assert.match(globalStyles, new RegExp(mapping.replace(/[()]/g, "\\$&")));
  }
});

test("the permanent repository standard documents and enforces shared theme development", () => {
  const agents = read("AGENTS.md");
  const guide = read("docs/architecture/theme-development.md");
  assert.match(
    agents,
    /All new or modified interfaces must use the shared semantic theme variables for appearance colors\./,
  );
  assert.match(agents, /docs\/architecture\/theme-development\.md/);
  assert.match(agents, /<!-- BEGIN:nextjs-agent-rules -->[\s\S]*<!-- END:nextjs-agent-rules -->/);
  assert.match(guide, /getAppearanceCssVariables/);
  assert.match(guide, /data-appearance-theme-scope/);
  assert.match(guide, /--st-health/);
  assert.match(guide, /print\/export rules remain fixed/);
});
