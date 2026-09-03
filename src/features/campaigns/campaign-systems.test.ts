import assert from "node:assert/strict";
import test from "node:test";

import { getEffectiveCampaignSystems } from "./campaign-systems";

test("legacy Derived Ability configuration enables the effective Campaign system", () => {
  assert.deepEqual(
    getEffectiveCampaignSystems(["Tier 1"], {
      hasLegacyDerivedAbilityConfiguration: true,
      legacyDerivedAbilityCompatibilityResolved: false,
    }),
    ["Tier 1", "Derived Abilities"],
  );
});

test("no explicit system and no historical use leaves Derived Abilities disabled", () => {
  assert.deepEqual(
    getEffectiveCampaignSystems(["Tier 1"], {
      hasLegacyDerivedAbilityConfiguration: false,
      legacyDerivedAbilityCompatibilityResolved: false,
    }),
    ["Tier 1"],
  );
});

test("explicit new configuration remains enabled regardless of legacy rows", () => {
  assert.deepEqual(
    getEffectiveCampaignSystems(["Tier 1", "Derived Abilities"], {
      hasLegacyDerivedAbilityConfiguration: false,
      legacyDerivedAbilityCompatibilityResolved: true,
    }),
    ["Tier 1", "Derived Abilities"],
  );
  assert.deepEqual(
    getEffectiveCampaignSystems(["Derived Abilities"], {
      hasLegacyDerivedAbilityConfiguration: true,
      legacyDerivedAbilityCompatibilityResolved: false,
    }),
    ["Derived Abilities"],
  );
});

test("a reconciled explicit disable is not re-enabled by preserved legacy rows", () => {
  assert.deepEqual(
    getEffectiveCampaignSystems(["Tier 1"], {
      hasLegacyDerivedAbilityConfiguration: true,
      legacyDerivedAbilityCompatibilityResolved: true,
    }),
    ["Tier 1"],
  );
});
