import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canEditSharedLibraryRoot } from "@/features/authorization/shared-library-access";
import { CATALOG_KEYS, classifyCatalogContent, defaultCatalogPreferences, isCatalogContentVisible, parseCatalogPreferenceChange } from "./catalog-visibility";

const content = [
  { id: 1, isSystemCanon: true, createdByUserId: null },
  { id: 2, isSystemCanon: false, createdByUserId: "me" },
  { id: 3, isSystemCanon: true, createdByUserId: "me" },
  { id: 4, isSystemCanon: false, createdByUserId: "other" },
  { id: 5, isSystemCanon: false, createdByUserId: null, sourceSystem: "serrian-tide" },
  { id: 6, isSystemCanon: true, createdByUserId: "other" },
];

test("Canon Only uses the explicit flag, regardless of creator or import provenance", () => {
  assert.deepEqual(content.filter((row) => isCatalogContentVisible(row, "me", "canon")).map((row) => row.id), [1, 3, 6]);
});
test("Mine Only includes my promoted records but classifies them as Canon", () => {
  assert.deepEqual(content.filter((row) => isCatalogContentVisible(row, "me", "mine")).map((row) => row.id), [2, 3]);
  assert.deepEqual(content.map((row) => classifyCatalogContent(row, "me")), ["canon", "mine", "canon", "other", "other", "canon"]);
});
test("Canon + Mine is one union without duplicate promoted records or foreign non-canon content", () => {
  const visible = content.filter((row) => isCatalogContentVisible(row, "me", "canon-and-mine"));
  assert.deepEqual(visible.map((row) => row.id), [1, 2, 3, 6]);
  assert.equal(visible.filter((row) => row.id === 3).length, 1);
});
test("all six preferences default independently and runtime payloads reject identity injection", () => {
  assert.deepEqual(Object.keys(defaultCatalogPreferences()), [...CATALOG_KEYS]);
  assert.ok(Object.values(defaultCatalogPreferences()).every((mode) => mode === "canon-and-mine"));
  const modified = defaultCatalogPreferences();
  modified.race = "mine";
  assert.equal(defaultCatalogPreferences().race, "canon-and-mine");
  for (const input of [null, [], {}, { catalog: "race", mode: "all" }, { catalog: "all", mode: "mine" }, { catalog: "race", mode: "mine", userId: "victim" }]) {
    assert.throws(() => parseCatalogPreferenceChange(input));
  }
  assert.deepEqual(parseCatalogPreferenceChange({ catalog: "equipment", mode: "canon" }), { catalog: "equipment", mode: "canon" });
});
test("canon governance does not redefine existing shared-library edit permissions", () => {
  for (const isSystemCanon of [false, true]) {
    const imported = { createdByUserId: "me", sourceSystem: "import", isSystemCanon };
    const authored = { createdByUserId: "me", sourceSystem: null, isSystemCanon };
    assert.equal(canEditSharedLibraryRoot({ userId: "me", roles: ["admin"] }, imported), false);
    assert.equal(canEditSharedLibraryRoot({ userId: "me", roles: ["god"] }, authored), true);
    assert.equal(canEditSharedLibraryRoot({ userId: "other", roles: ["god"] }, authored), false);
    assert.equal(canEditSharedLibraryRoot({ userId: "me", roles: ["player"] }, authored), false);
  }
});
test("public operations obtain identity from the session rather than a payload user ID", () => {
  const source = readFileSync("src/features/catalog-visibility/actions.ts", "utf8");
  assert.match(source, /^"use server"/);
  assert.match(source, /bindCatalogPreferenceOperations\(async \(\) => \(await requireSession\(\)\)\.user\.id\)/);
  assert.match(source, /setSystemCanonForActor\(session\.user\.id, input\)/);
});
