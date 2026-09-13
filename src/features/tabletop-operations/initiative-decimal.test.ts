import assert from "node:assert/strict";
import test from "node:test";
import { decimalAdd, decimalSubtract, decimalMultiply, completedDecimalUnits } from "@/lib/decimal";

test("decimal timing arithmetic preserves small, signed and scientific-notation values", () => {
  assert.equal(decimalAdd(0.1, 0.2), 0.3);
  assert.equal(decimalSubtract(22, 0.3), 21.7);
  assert.equal(decimalSubtract(22, 21.7), 0.3);
  assert.equal(decimalAdd(0.25, -0.05), 0.2);
  assert.equal(decimalAdd(1e-7, 2e-7), 3e-7);
  assert.equal(decimalMultiply(0.1, 3), 0.3);
  assert.equal(completedDecimalUnits(0.3, 0.1), 3);
  assert.equal(completedDecimalUnits(0.299999, 0.1), 2);
  assert.throws(() => decimalAdd(Infinity, 1), /finite/);
});
