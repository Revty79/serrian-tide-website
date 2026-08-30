import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  normalizeCampaignDerivedAbilityIds,
  validateCampaignDerivedAbilitySelection,
} from "@/features/derived-abilities/campaign-derived-abilities";

function readSource(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("Campaign Derived Ability selections de-duplicate and reject invalid or stale IDs", () => {
  assert.deepEqual(normalizeCampaignDerivedAbilityIds([3, 1, 3]), [3, 1]);
  assert.deepEqual(validateCampaignDerivedAbilitySelection([2, 1], [1, 2, 3]), [2, 1]);
  assert.throws(() => normalizeCampaignDerivedAbilityIds([0]), /invalid record/);
  assert.throws(() => normalizeCampaignDerivedAbilityIds([1.5]), /invalid record/);
  assert.throws(
    () => validateCampaignDerivedAbilitySelection([1, 99], [1, 2]),
    /no longer available/,
  );
});

test("different Campaigns retain independent Derived Ability selections", () => {
  const existing = [1, 2, 3, 4, 5, 6];
  const campaignA = validateCampaignDerivedAbilitySelection([1, 2], existing);
  const campaignB = validateCampaignDerivedAbilitySelection([5, 6], existing);
  assert.deepEqual(campaignA, [1, 2]);
  assert.deepEqual(campaignB, [5, 6]);
});

test("Create Campaign validates real IDs and inserts associations transactionally", () => {
  const source = readSource("src/app/heavens/campaigns/new/actions.ts");
  assert.match(source, /readPositiveIntegerList\([\s\S]*"allowedDerivedAbilityIds"/);
  assert.match(source, /validateCampaignDerivedAbilitySelection/);
  assert.match(source, /db\.transaction/);
  assert.match(source, /tx\.insert\(campaignAllowedDerivedAbility\)/);
  assert.match(source, /G\.O\.D\. access is required/);
});

test("Campaign Settings is owner-authorized and replaces persisted selections", () => {
  const source = readSource("src/app/heavens/campaigns/actions.ts");
  assert.match(source, /await requireOwner\(input\.id\)/);
  assert.match(source, /validateCampaignDerivedAbilitySelection/);
  assert.match(source, /tx\.delete\(campaignAllowedDerivedAbility\)/);
  assert.match(source, /tx\.insert\(campaignAllowedDerivedAbility\)/);
  assert.match(source, /allowedDerivedAbilityIds: derivedAbilities\.map/);
});

test("one reusable selector serves Campaign Create and Campaign Settings", () => {
  const create = readSource("src/app/heavens/campaigns/new/campaign-create-form.tsx");
  const edit = readSource("src/app/heavens/campaigns/campaign-workspace.tsx");
  for (const source of [create, edit]) {
    assert.match(source, /CampaignDerivedAbilitySelector/);
  }
  assert.match(create, /inputName="allowedDerivedAbilityIds"/);
  assert.match(edit, /allowedDerivedAbilityIds/);
});

test("existing Campaigns are not opted into canonical abilities by migration", () => {
  const migration = readSource("drizzle/0009_add_derived_abilities.sql");
  assert.doesNotMatch(migration, /INSERT INTO "campaign_allowed_derived_ability"/);
});
