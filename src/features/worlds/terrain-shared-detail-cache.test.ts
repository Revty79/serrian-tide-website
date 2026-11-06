import assert from "node:assert/strict";
import test from "node:test";
import { sharedTerrainDetails } from "./terrain-shared-detail-cache";
import type { CachedDetailTile } from "./terrain-refinement-cache";

test("equal native counters in different historical appearances cannot share finer tile bytes", () => {
  const first = sharedTerrainDetails("history-cache-world", "terrain", "timeline:a:appearance:100");
  first.set("fine:2:0:0", {} as CachedDetailTile);
  const second = sharedTerrainDetails("history-cache-world", "terrain", "timeline:a:appearance:500");
  assert.notEqual(first, second); assert.equal(second.has("fine:2:0:0"), false);
  assert.equal(sharedTerrainDetails("history-cache-world", "terrain", "timeline:a:appearance:100"), first);
  sharedTerrainDetails("history-cache-world", "terrain", "timeline:branch:appearance:100");
  assert.equal(sharedTerrainDetails("history-cache-world", "terrain", "timeline:a:appearance:500").size, 0);
});
