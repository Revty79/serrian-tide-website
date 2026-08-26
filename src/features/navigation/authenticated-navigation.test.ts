import assert from "node:assert/strict";
import test from "node:test";

import {
  getCharacterToolReturnHref,
  getContextNavigationItems,
  getGodCharacterReturnHref,
  getNavigationBreadcrumbs,
  getRoleDestinations,
  isNavigationItemActive,
} from "./authenticated-navigation";

test("Heavens exposes one consistent set of major destinations", () => {
  assert.deepEqual(
    getContextNavigationItems("heavens").map(({ label }) => label),
    [
      "Heavens Dashboard",
      "Campaign Settings",
      "Races",
      "Skills",
      "Creatures",
      "Equipment",
      "Inventory",
      "NPCs",
    ],
  );
});

test("active destination identifies both libraries and their nested editors", () => {
  const campaigns = { label: "Campaign Settings", href: "/heavens/campaigns" };
  const dashboard = { label: "Heavens Dashboard", href: "/heavens" };
  assert.equal(isNavigationItemActive("/heavens/campaigns/new", campaigns), true);
  assert.equal(isNavigationItemActive("/heavens/characters/42", campaigns), false);
  assert.equal(isNavigationItemActive("/heavens/characters/42", dashboard), true);
  assert.equal(isNavigationItemActive("/heavens/characters/42", campaigns, "npcs"), false);
  assert.equal(
    isNavigationItemActive(
      "/heavens/characters/42",
      { label: "NPCs", href: "/heavens/npcs" },
      "npcs",
    ),
    true,
  );
  assert.equal(isNavigationItemActive("/heavens/races", campaigns), false);
  assert.equal(isNavigationItemActive("/heavens/races", dashboard), false);
});

test("NPC Character editing identifies and breadcrumbs back to the NPC workshop", () => {
  assert.deepEqual(
    getNavigationBreadcrumbs("/heavens/characters/42", "heavens", "npcs").map(
      ({ label }) => label,
    ),
    ["Heavens Dashboard", "NPCs", "Character"],
  );
});

test("Campaign creation and Character editing retain logical return context", () => {
  assert.equal(
    getGodCharacterReturnHref({
      source: "heavens",
      campaignId: 12,
      playerUserId: "user-2",
    }),
    "/heavens?campaign=12&player=user-2",
  );
  assert.deepEqual(
    getNavigationBreadcrumbs("/heavens/campaigns/new", "heavens").map(
      ({ label }) => label,
    ),
    ["Heavens Dashboard", "Campaign Settings", "Create Campaign"],
  );
  assert.equal(
    getNavigationBreadcrumbs(
      "/heavens/characters/42",
      "heavens",
      "heavens",
      12,
      "user-2",
    )[1]?.href,
    "/heavens?campaign=12&player=user-2",
  );
});

test("Character sub-tools return to the selected Character context", () => {
  assert.equal(getCharacterToolReturnHref(42), "/realms/characters/42");
  assert.deepEqual(
    getNavigationBreadcrumbs("/realms/characters/42/spellbook", "realms").map(
      ({ label }) => label,
    ),
    ["Realms Dashboard", "Character", "Spellbook"],
  );
});

test("role destinations expose only authorized application contexts", () => {
  assert.deepEqual(
    getRoleDestinations(["god", "player"]).map(({ label }) => label),
    ["Heavens", "Realms"],
  );
  assert.deepEqual(
    getRoleDestinations(["admin", "god", "player"]).map(({ label }) => label),
    ["Admin", "Heavens", "Realms"],
  );
});

test("library pages breadcrumb directly back to their Heavens library context", () => {
  assert.deepEqual(
    getNavigationBreadcrumbs("/heavens/creatures", "heavens").map(
      ({ label }) => label,
    ),
    ["Heavens Dashboard", "Creatures"],
  );
});

test("Add Player remains an inline action rather than an authenticated destination", () => {
  const allDestinations = ["admin", "heavens", "realms"] as const;
  assert.equal(
    allDestinations
      .flatMap((context) => getContextNavigationItems(context))
      .some(({ href }) => href.includes("add-player")),
    false,
  );
});
