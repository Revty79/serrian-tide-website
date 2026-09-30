import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillPreview } from "@/app/heavens/skills/skill-preview";
import { SkillConstructionEditor } from "@/app/heavens/skills/skill-construction-editor";
import type { SkillDraft } from "@/app/heavens/skills/actions";

const draft: SkillDraft = { core: { name: "Synthetic future document", classification: "special ability", tier: null, primaryAttribute: null, secondaryAttribute: null,
  definition: "The root description is still readable.", sourceSystem: null, sourceExternalId: null }, relationships: [],
  extensions: [{ extensionType: "spell-construction", schemaVersion: 999, data: null, readStatus: "unsupported", diagnostics: ["A compatible editor is required."] },
    { extensionType: "special-ability-mechanics", schemaVersion: 99, data: null, readStatus: "unsupported", diagnostics: ["Mechanics version 99 is preserved."] }] };

test("unsupported documents show visible diagnostics while preserving the root Skill preview", () => {
  const html = renderToStaticMarkup(createElement(SkillPreview, { draft }));
  assert.match(html, /The root description is still readable/);
  assert.match(html, /Mechanics version 99 is preserved/);
  assert.match(html, /A compatible editor is required/);
  assert.match(html, /role="status"/);
});
test("an older Spell Construction editor never mounts editable controls for a future document", () => {
  let edited = false;
  const html = renderToStaticMarkup(createElement(SkillConstructionEditor, { draft, onChange: () => { edited = true; }, findFrameworkSkills: async () => [] }));
  assert.match(html, /Spell Construction is unavailable in this editor/);
  assert.match(html, /You can save Skill details/);
  assert.doesNotMatch(html, /Attach Spell Construction|Detach Construction|Confirm Remove/);
  assert.equal(edited, false);
});
