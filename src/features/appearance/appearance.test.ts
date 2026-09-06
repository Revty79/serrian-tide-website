import assert from "node:assert/strict";
import test from "node:test";

import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  contrastRatio,
  getAppearanceContrastIssues,
  getAppearanceCssVariables,
  parseSiteAppearance,
} from "./appearance";

test("Serrian Tide is the readable built-in default and Classic remains available", () => {
  assert.equal(DEFAULT_APPEARANCE.presetId, "serrian-tide");
  assert.deepEqual(DEFAULT_APPEARANCE, APPEARANCE_PRESETS["serrian-tide"]);
  assert.deepEqual(getAppearanceContrastIssues(DEFAULT_APPEARANCE), []);
  assert.deepEqual(getAppearanceContrastIssues(APPEARANCE_PRESETS.classic), []);
  assert.ok(contrastRatio(DEFAULT_APPEARANCE.mainText, DEFAULT_APPEARANCE.pageBackground) >= 4.5);
});

test("appearance parsing normalizes exact supported colors", () => {
  const parsed = parseSiteAppearance({
    presetId: "serrian-tide",
    pageBackground: " #06110f ",
    surfaceBackground: "#101a18",
    primaryAccent: "#58b88b",
    secondaryAccent: "#e6c75a",
    mainText: "#f1f3e8",
    mutedText: "#aab9b0",
    ignored: "#FFFFFF",
  });
  assert.equal(parsed.pageBackground, "#06110F");
  assert.equal(parsed.primaryAccent, "#58B88B");
  assert.equal("ignored" in parsed, false);
});

test("appearance parsing rejects unsupported presets and malformed colors", () => {
  assert.throws(
    () => parseSiteAppearance({ ...DEFAULT_APPEARANCE, presetId: "invented" }),
    /supported appearance preset/,
  );
  assert.throws(
    () => parseSiteAppearance({ ...DEFAULT_APPEARANCE, pageBackground: "navy" }),
    /format #RRGGBB/,
  );
});

test("appearance parsing prevents unreadable text and invisible accents", () => {
  assert.throws(
    () => parseSiteAppearance({
      ...DEFAULT_APPEARANCE,
      mainText: DEFAULT_APPEARANCE.pageBackground,
      mutedText: DEFAULT_APPEARANCE.surfaceBackground,
      primaryAccent: DEFAULT_APPEARANCE.surfaceBackground,
      secondaryAccent: DEFAULT_APPEARANCE.pageBackground,
    }),
    /4.5:1 contrast.*3:1 contrast/,
  );
});

test("root theme variables include safe text colors for both accents", () => {
  const variables = getAppearanceCssVariables(DEFAULT_APPEARANCE);
  assert.equal(variables["--st-page"], "#04030C");
  assert.equal(variables["--st-primary"], "#4DA97D");
  assert.match(variables["--st-on-primary"]!, /^#[0-9A-F]{6}$/);
  assert.match(variables["--st-on-secondary"]!, /^#[0-9A-F]{6}$/);
});
