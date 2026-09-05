import assert from "node:assert/strict";
import test from "node:test";

import {
  clampScrollOffset,
  isSameInPlaceRoute,
} from "@/lib/in-place-scroll";

test("scroll restoration keeps an available position and clamps removed content", () => {
  assert.equal(clampScrollOffset(640, 2_000, 800), 640);
  assert.equal(clampScrollOffset(1_600, 2_000, 800), 1_200);
  assert.equal(clampScrollOffset(90, 500, 800), 0);
  assert.equal(clampScrollOffset(-30, 2_000, 800), 0);
});

test("in-place restoration accepts query changes but rejects a different route", () => {
  assert.equal(isSameInPlaceRoute("/heavens/tabletop", "/heavens/tabletop"), true);
  assert.equal(isSameInPlaceRoute("/heavens/tabletop", "/heavens/campaigns"), false);
});
