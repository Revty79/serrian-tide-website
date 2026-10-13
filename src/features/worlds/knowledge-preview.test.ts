import assert from "node:assert/strict";
import test from "node:test";
import { authorKnowledge, ordinaryKnowledge, readOnlyPreview } from "./knowledge-preview";

test("either ordinary alias enforces preview even when the other asks for author mode", () => {
  for (const query of ["knowledge=ordinary", "ordinary=1", "knowledge=ordinary&ordinary=0", "knowledge=author&ordinary=1"])
    assert.equal(ordinaryKnowledge(new URLSearchParams(query)), true);
  assert.equal(ordinaryKnowledge(new URLSearchParams("knowledge=author&ordinary=0")), false);
});

test("returning to author mode clears both aliases while preserving timeline, year and review", () => {
  const query = new URLSearchParams("knowledge=ordinary&ordinary=1&timeline=branch&mapYear=-50&review=1&place=harbor");
  authorKnowledge(query);
  assert.equal(ordinaryKnowledge(query), false);
  assert.equal(readOnlyPreview(query), true);
  assert.equal(query.toString(), "timeline=branch&mapYear=-50&review=1&place=harbor");
  query.delete("review");
  assert.equal(readOnlyPreview(query), false);
});
