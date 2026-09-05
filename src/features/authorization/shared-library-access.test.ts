import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertCanEditSharedLibraryRoot,
  canAccessSharedLibrary,
  canEditSharedLibraryRoot,
} from "./shared-library-access";

const ownerGod = { userId: "owner", roles: ["god"] } as const;
const otherGod = { userId: "other", roles: ["god"] } as const;
const administrator = { userId: "administrator", roles: ["admin"] } as const;
const godAdministrator = {
  userId: "god-administrator",
  roles: ["god", "admin"],
} as const;
const player = { userId: "player", roles: ["player"] } as const;

const userCreated = { createdByUserId: "owner", sourceSystem: null };
const canonical = { createdByUserId: null, sourceSystem: "serrian-tide-core" };
const ambiguousLegacy = { createdByUserId: null, sourceSystem: null };

function source(path: string): string {
  return readFileSync(path, "utf8");
}

test("shared library entry requires a database-resolved G.O.D. or administrator role", () => {
  assert.equal(canAccessSharedLibrary(ownerGod), true);
  assert.equal(canAccessSharedLibrary(administrator), true);
  assert.equal(canAccessSharedLibrary(player), false);
});

test("user-created shared roots are editable only by their creator or an administrator", () => {
  assert.equal(canEditSharedLibraryRoot(ownerGod, userCreated), true);
  assert.equal(canEditSharedLibraryRoot(administrator, userCreated), true);
  assert.equal(canEditSharedLibraryRoot(otherGod, userCreated), false);
  assert.equal(canEditSharedLibraryRoot(player, userCreated), false);
  assert.throws(
    () => assertCanEditSharedLibraryRoot(otherGod, userCreated, "Skill"),
    /creator or an administrator/,
  );
});

test("protected master content retains G.O.D. authoring without granting it to Admin-only users", () => {
  for (const root of [canonical, ambiguousLegacy]) {
    assert.equal(canEditSharedLibraryRoot(ownerGod, root), true);
    assert.equal(canEditSharedLibraryRoot(otherGod, root), true);
    assert.equal(canEditSharedLibraryRoot(godAdministrator, root), true);
    assert.equal(canEditSharedLibraryRoot(administrator, root), false);
    assert.equal(canEditSharedLibraryRoot(player, root), false);
  }
  assert.throws(
    () => assertCanEditSharedLibraryRoot(administrator, canonical, "Item"),
    /Only a G\.O\.D\. may edit protected/,
  );
});

test("all shared-library pages and server actions admit administrators and enforce stored ownership", () => {
  const surfaces = [
    {
      pages: ["src/app/heavens/races/page.tsx"],
      actions: "src/app/heavens/races/actions.ts",
    },
    {
      pages: ["src/app/heavens/creatures/page.tsx"],
      actions: "src/app/heavens/creatures/actions.ts",
    },
    {
      pages: [
        "src/app/heavens/equipment/page.tsx",
        "src/app/heavens/inventory/page.tsx",
      ],
      actions: "src/app/heavens/items/actions.ts",
    },
    {
      pages: ["src/app/heavens/skills/page.tsx"],
      actions: "src/app/heavens/skills/actions.ts",
    },
    {
      pages: ["src/app/heavens/derived-abilities/page.tsx"],
      actions: "src/app/heavens/derived-abilities/actions.ts",
    },
  ];

  assert.match(source("src/app/heavens/layout.tsx"), /requireGodOrAdminAccessContext/);
  for (const surface of surfaces) {
    for (const page of surface.pages) {
      assert.match(source(page), /requireGodOrAdminAccessContext/);
    }
    const actions = source(surface.actions);
    assert.match(actions, /requireGodOrAdminAccessContext/);
    assert.match(actions, /assertCanEditSharedLibraryRoot/);
    assert.match(actions, /createdByUserId:\s*session\.user\.id/);
    assert.match(actions, /createdByUserId:\s*\w+\.createdByUserId/);
    assert.doesNotMatch(actions, /\brequireGod\(/);
  }
});

test("Campaign workspace and global creation references admit Admin-only users", () => {
  const actions = source("src/app/heavens/campaigns/actions.ts");
  assert.match(actions, /async function requireOwner[\s\S]*requireGodOrAdminAccessContext/);
  assert.match(actions, /roles\.includes\("admin"\)/);

  for (const actionName of [
    "getCampaignCreationReferenceData",
    "getCampaignInventoryItems",
  ]) {
    const actionStart = actions.indexOf(`export async function ${actionName}`);
    assert.notEqual(actionStart, -1);
    assert.match(
      actions.slice(actionStart, actionStart + 500),
      /requireGodOrAdminAccessContext\(\)/,
    );
  }
});
