import assert from "node:assert/strict";
import test from "node:test";
import { creatureProtectionValue } from "./creature-protection";

test("only absent creature protection defaults to zero; malformed protection remains unresolved", () => {
  for (const value of [null, undefined, "", "  ", 0, "0"]) assert.equal(creatureProtectionValue(value), 0);
  for (const value of [2, "2", "2.0"]) assert.equal(creatureProtectionValue(value), 2);
  for (const value of ["unknown", "see notes", false, {}, [], -1, "-1", Infinity, NaN]) assert.equal(creatureProtectionValue(value), null);
});
