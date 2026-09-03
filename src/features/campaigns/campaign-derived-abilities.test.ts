import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { campaignSystem } from "@/db/campaign-schema";

function readSource(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("Derived Abilities is a valid persisted Campaign System", () => {
  assert.equal(campaignSystem.enumValues.includes("Derived Abilities"), true);

  const migration = readSource("drizzle/0015_derived_abilities_campaign_system.sql");
  assert.match(
    migration,
    /ALTER TYPE "public"\."campaign_system" ADD VALUE 'Derived Abilities'/,
  );
  assert.doesNotMatch(migration, /CREATE TABLE|DROP TABLE|DELETE FROM|INSERT INTO/);
});

test("Campaign creation uses the Allowed Systems checkbox and no per-ability selector", () => {
  const form = readSource("src/app/heavens/campaigns/new/campaign-create-form.tsx");
  const action = readSource("src/app/heavens/campaigns/new/actions.ts");

  assert.match(form, /CAMPAIGN_SYSTEM_OPTIONS[\s\S]*"Derived Abilities"/);
  assert.match(form, /name="allowedSystems"/);
  assert.doesNotMatch(form, /CampaignDerivedAbilitySelector|allowedDerivedAbilityIds/);
  assert.match(action, /\.getAll\("allowedSystems"\)/);
  assert.match(action, /tx[\s\S]*\.insert\(campaignAllowedSystem\)/);
  assert.doesNotMatch(
    action,
    /campaignAllowedDerivedAbility|allowedDerivedAbilityIds|validateCampaignDerivedAbilitySelection/,
  );
});

test("Campaign editing replaces Allowed Systems and has no per-ability governance", () => {
  const workspace = readSource("src/app/heavens/campaigns/campaign-workspace.tsx");
  const action = readSource("src/app/heavens/campaigns/actions.ts");

  assert.match(workspace, /const SYSTEMS =[\s\S]*"Derived Abilities"/);
  assert.match(workspace, /draft\.allowedSystems\.includes\(system\)/);
  assert.doesNotMatch(
    workspace,
    /CampaignDerivedAbilitySelector|allowedDerivedAbilityIds|tab === "derivedAbilities"/,
  );
  assert.match(action, /tx\.delete\(campaignAllowedSystem\)/);
  assert.match(action, /tx\.insert\(campaignAllowedSystem\)/);
  assert.doesNotMatch(
    action,
    /campaignAllowedDerivedAbility|allowedDerivedAbilityIds|validateCampaignDerivedAbilitySelection/,
  );
});

test("Character aggregates load the V1 catalog directly and resolution uses Campaign systems", () => {
  const action = readSource("src/app/characters/actions.ts");
  const resolver = readSource(
    "src/features/derived-abilities/derived-ability-rules.ts",
  );

  assert.match(action, /\.from\(derivedAbility\)/);
  assert.doesNotMatch(action, /campaignAllowedDerivedAbility/);
  assert.match(resolver, /allowedSystems\.includes\("Derived Abilities"\)/);
});

test("legacy per-ability Campaign storage and existing data remain preserved", () => {
  const schema = readSource("src/db/derived-ability-schema.ts");
  const baseline = readSource("drizzle/0000_serrian_tide_baseline.sql");
  const migration = readSource("drizzle/0015_derived_abilities_campaign_system.sql");

  assert.match(schema, /Legacy campaign-level allowlisting retained/);
  assert.match(schema, /export const campaignAllowedDerivedAbility = pgTable/);
  assert.match(baseline, /CREATE TABLE "campaign_allowed_derived_ability"/);
  assert.doesNotMatch(migration, /campaign_allowed_derived_ability/);
});
