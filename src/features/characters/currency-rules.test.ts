import assert from "node:assert/strict";
import test from "node:test";

import {
  convertCreditsToDerivedUnits,
  formatCampaignMoney,
  getCanonicalCreditsFromHoldings,
  getCampaignMoneyBreakdown,
  getStoredCampaignMoneyBreakdown,
} from "./currency-rules";
import type { CharacterCampaignRules } from "./models";

const currencies: CharacterCampaignRules["derivedCurrencies"] = [
  { id: 1, campaignId: 12, name: "Penny", description: "Copper coin", creditsPerUnit: 0.01, sortOrder: 0 },
  { id: 2, campaignId: 12, name: "Nickel", description: "Silver coin", creditsPerUnit: 0.05, sortOrder: 1 },
  { id: 3, campaignId: 12, name: "Dime", description: "Small silver coin", creditsPerUnit: 0.1, sortOrder: 2 },
  { id: 4, campaignId: 12, name: "Quarter", description: "Large silver coin", creditsPerUnit: 0.25, sortOrder: 3 },
  { id: 5, campaignId: 12, name: "Dollar", description: "One bill", creditsPerUnit: 1, sortOrder: 4 },
  { id: 6, campaignId: 12, name: "Five Dollar Bill", description: "Five bill", creditsPerUnit: 5, sortOrder: 5 },
];

test("canonical balances distribute into whole configured denominations", () => {
  const result = getCampaignMoneyBreakdown(12.41, "Derived Currency", currencies);
  assert.equal(result.fullyRepresented, true);
  assert.equal(
    result.formatted,
    "2 Five Dollar Bill, 2 Dollar, 1 Quarter, 1 Dime, 1 Nickel, 1 Penny",
  );
  assert.deepEqual(
    result.entries.map(({ name, quantity }) => ({ name, quantity })),
    [
      { name: "Five Dollar Bill", quantity: 2 },
      { name: "Dollar", quantity: 2 },
      { name: "Quarter", quantity: 1 },
      { name: "Dime", quantity: 1 },
      { name: "Nickel", quantity: 1 },
      { name: "Penny", quantity: 1 },
    ],
  );
});

test("Credits are used only when they are the Campaign currency", () => {
  assert.equal(formatCampaignMoney(12.5, "Credits", []), "12.5 Credits");
  assert.equal(convertCreditsToDerivedUnits(400, 5), 80);
});

test("a denomination gap is reported instead of inventing fractional coins", () => {
  const result = getCampaignMoneyBreakdown(
    0.03,
    "Derived Currency",
    currencies.slice(1),
  );
  assert.equal(result.fullyRepresented, false);
  assert.match(result.formatted, /denomination gap/);
  assert.doesNotMatch(result.formatted, /Credits/);
});

test("saved denomination quantities are preserved", () => {
  const holdings = [{ currencyId: 5, quantity: 10 }];
  const purse = getStoredCampaignMoneyBreakdown(
    10,
    "Derived Currency",
    currencies,
    holdings,
  );
  assert.equal(purse.formatted, "10 Dollar");
  assert.equal(
    purse.entries.find((entry) => entry.name === "Five Dollar Bill")?.quantity,
    0,
  );
  assert.equal(getCanonicalCreditsFromHoldings(currencies, holdings), 10);
});
