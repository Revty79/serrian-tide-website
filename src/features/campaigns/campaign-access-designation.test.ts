import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCampaignAccessDesignation,
  campaignAccessLabel,
  sortCampaignsByAccess,
} from "./campaign-access-designation";

test("Campaign access designation distinguishes ownership from administrator scope", () => {
  const owned = buildCampaignAccessDesignation({
    actingUserId: "owner-1",
    ownerUserId: "owner-1",
    ownerName: "Brannan",
    ownerUsername: "brannan",
    ownerDisplayUsername: null,
  });
  const administered = buildCampaignAccessDesignation({
    actingUserId: "admin-1",
    ownerUserId: "owner-1",
    ownerName: "Brannan",
    ownerUsername: "brannan",
    ownerDisplayUsername: "Tidekeeper",
  });

  assert.deepEqual(owned, {
    ownerUserId: "owner-1",
    ownerLabel: "Brannan (brannan)",
    accessKind: "owner",
  });
  assert.equal(campaignAccessLabel(owned), "Yours");
  assert.equal(
    campaignAccessLabel(administered),
    "Admin access · Owner: Brannan (Tidekeeper)",
  );
  assert.equal(
    campaignAccessLabel(administered, "Admin view"),
    "Admin view · Owner: Brannan (Tidekeeper)",
  );
});

test("Campaign access sorting keeps owned Campaigns first and orders each group by name", () => {
  const sorted = sortCampaignsByAccess([
    { id: 4, name: "Zephyr", accessKind: "administrator" as const },
    { id: 3, name: "Amber", accessKind: "owner" as const },
    { id: 2, name: "Cinder", accessKind: "administrator" as const },
    { id: 1, name: "Beacon", accessKind: "owner" as const },
  ]);

  assert.deepEqual(sorted.map(({ id }) => id), [3, 1, 2, 4]);
});

test("Heavens campaign surfaces display ownership and administrator designations", () => {
  const control = readFileSync("src/app/heavens/heavens-campaign-control.tsx", "utf8");
  const settings = readFileSync("src/app/heavens/campaigns/campaign-workspace.tsx", "utf8");
  const tabletop = readFileSync("src/app/heavens/tabletop/tabletop-workspace.tsx", "utf8");

  assert.match(control, /campaignAccessLabel\(campaign\)/);
  assert.match(control, /campaignAccessLabel\(selectedCampaign\)/);
  assert.match(settings, /campaign-access-badge/);
  assert.match(settings, /Admin access/);
  assert.match(settings, /campaignAccessLabel\(selectedSummary\)/);
  assert.match(tabletop, /campaignAccessLabel\(entry, "Admin view"\)/);
  assert.match(tabletop, /tabletop-campaign-access/);
});
