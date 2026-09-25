import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHumanoidRaceAnatomy, normalizeRaceAnatomy, raceHitLocations } from "./race-anatomy";
import { resolveHumanoidHealthAnatomy, resolveRaceHealthAnatomy } from "@/features/active-state/anatomy";
import { applyAreaHealing, applyLocalizedDamage, createEmptyActiveHealthState, resolveActiveHealthView } from "@/features/active-state/health-rules";
import { CharacterHitLocationChart } from "@/app/characters/character-hit-location-chart";

function tailedRace() {
  const anatomy = createHumanoidRaceAnatomy();
  anatomy.hpPools = anatomy.hpPools.filter((pool) => !["rightLeg", "leftLeg"].includes(pool.canonicalId));
  anatomy.hpPools.push({ canonicalId: "tail", poolName: "Tail", hpPercentage: 30, notes: "", sortOrder: 4 });
  anatomy.hitLocations = anatomy.hitLocations.map((location) => [3, 4, 5, 6].includes(location.hitLocationNumber) ? { ...location, locationName: "Tail", bodyPartsIncluded: "Tail", hpPoolCanonicalId: "tail" } : location);
  return anatomy;
}

test("existing races retain the exact humanoid anatomy and character HP rule", () => {
  assert.deepEqual(resolveRaceHealthAnatomy(35, 2), resolveHumanoidHealthAnatomy(35, 2));
  const custom = resolveRaceHealthAnatomy(35, 2, createHumanoidRaceAnatomy());
  assert.deepEqual(custom.pools, resolveHumanoidHealthAnatomy(35, 2).pools);
});

test("tail hit results share one pool and use existing damage and healing", () => {
  const anatomy = resolveRaceHealthAnatomy(35, 0, tailedRace());
  assert.equal(anatomy.kind, "race");
  assert.equal(anatomy.totalMaximumHp, 72);
  assert.equal(anatomy.pools.find((pool) => pool.key === "tail")?.maximumHp, 22);
  let state = applyLocalizedDamage(createEmptyActiveHealthState(1), anatomy, { hitLocationNumber: 3, amount: 4 });
  state = applyLocalizedDamage(state, anatomy, { hitLocationNumber: 6, amount: 3 });
  assert.equal(state.totalDamage, 7);
  assert.deepEqual(state.pools, [{ poolKey: "tail", poolNameSnapshot: "Tail", damage: 7 }]);
  state = applyAreaHealing(state, anatomy, "tail", 2);
  assert.equal(state.pools[0].damage, 5);
  assert.equal(state.totalDamage, 7, "area healing preserves existing total-healing semantics");
  const renamed = tailedRace(); renamed.hpPools.find((pool) => pool.canonicalId === "tail")!.poolName = "Serpentine Tail";
  assert.equal(resolveActiveHealthView(resolveRaceHealthAnatomy(35, 0, renamed), state).tracks.find((pool) => pool.key === "tail")?.damage, 5);
  const reverted = resolveActiveHealthView(resolveHumanoidHealthAnatomy(35, 0), state);
  assert.equal(reverted.tracks.find((pool) => pool.key === "tail")?.orphaned, true);
  assert.equal(reverted.totalDamage, 7);
});

test("race authoring rejects duplicate results, broken pool references and invalid percentages", () => {
  const duplicated = tailedRace(); duplicated.hitLocations[1].hitLocationNumber = 0;
  assert.throws(() => normalizeRaceAnatomy(duplicated), /different roll/);
  const broken = tailedRace(); broken.hitLocations[0].hpPoolCanonicalId = "missing";
  assert.throws(() => normalizeRaceAnatomy(broken), /existing HP Pool/);
  for (const invalid of [-1, NaN, Infinity]) {
    const input = tailedRace(); input.hpPools[0].hpPercentage = invalid;
    assert.throws(() => normalizeRaceAnatomy(input), /percentage/);
  }
  const incomplete = tailedRace(); incomplete.hpPools[0].hpPercentage = null; incomplete.hitLocations[0].hpPoolCanonicalId = null;
  assert.ok(normalizeRaceAnatomy(incomplete));
  assert.throws(() => applyLocalizedDamage(createEmptyActiveHealthState(1), resolveRaceHealthAnatomy(35, 0, incomplete), { hitLocationNumber: 0, amount: 1 }), /mapped/);
});

test("custom sheet shows authored tail names rather than a humanoid silhouette or legs", () => {
  const body = tailedRace();
  assert.equal(raceHitLocations(body).find((row) => row.key === "3")?.name, "Tail");
  const html = renderToStaticMarkup(createElement(CharacterHitLocationChart, { totalHp: 72, anatomy: resolveRaceHealthAnatomy(35, 0, body) }));
  assert.match(html, /Tail/);
  assert.doesNotMatch(html, /Right Leg|Left Leg|<svg/);
});
