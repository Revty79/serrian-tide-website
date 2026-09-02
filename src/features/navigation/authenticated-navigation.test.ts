import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  getAlternateRoleDestinations,
  getCharacterToolReturnHref,
  getContextHomeHref,
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
      "Crossroads",
      "Campaign Settings",
      "Tabletop Operations",
      "Races",
      "Skills",
      "Derived Abilities",
      "Creatures",
      "Equipment",
      "Inventory",
      "NPCs",
    ],
  );
});

test("Realms exposes the complete tool set while working inside a Character", () => {
  const items = getContextNavigationItems("realms", "/realms/characters/42/spellbook");
  assert.deepEqual(
    items.map(({ label }) => label),
    [
      "Realms Dashboard",
      "Crossroads",
      "Character Sheet",
      "Advancement",
      "Spellbook",
      "Magic Calculator",
    ],
  );
  assert.equal(
    isNavigationItemActive(
      "/realms/characters/42/spellbook",
      items.find(({ label }) => label === "Character Sheet")!,
    ),
    false,
  );
  assert.equal(
    isNavigationItemActive(
      "/realms/characters/42/spellbook",
      items.find(({ label }) => label === "Spellbook")!,
    ),
    true,
  );
  assert.deepEqual(getContextNavigationItems("realms"), [
    { label: "Realms Dashboard", href: "/realms" },
    { label: "Crossroads", href: "/chat" },
  ]);
});

test("every authenticated context exposes Crossroads exactly once, including Character routes", () => {
  for (const context of ["admin", "heavens", "realms"] as const) {
    const items = getContextNavigationItems(context);
    assert.equal(items.filter(({ href }) => href === "/chat").length, 1);
  }
  const characterItems = getContextNavigationItems(
    "realms",
    "/realms/characters/42/spellbook",
  );
  assert.equal(characterItems.filter(({ href }) => href === "/chat").length, 1);
  assert.equal(
    isNavigationItemActive("/chat", characterItems.find(({ href }) => href === "/chat")!),
    true,
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
  assert.deepEqual(
    getAlternateRoleDestinations(["admin", "god", "player"], "heavens").map(
      ({ label }) => label,
    ),
    ["Admin", "Realms"],
  );
  assert.deepEqual(getAlternateRoleDestinations(["god"], "heavens"), []);
  assert.equal(
    getAlternateRoleDestinations(["admin", "god", "player"], "heavens")
      .some(({ href }) => href === "/chat"),
    false,
  );
  assert.equal(getContextHomeHref("heavens"), "/heavens");
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

test("every public, shared, and contextual navigation destination has an application page", () => {
  const destinations = new Set([
    "/",
    "/login",
    "/register",
    "/access",
    ...(["admin", "heavens"] as const).flatMap((context) =>
      getContextNavigationItems(context).map(({ href }) => href),
    ),
    ...getContextNavigationItems("realms", "/realms/characters/42/random/guided").map(
      ({ href }) => href,
    ),
    ...getRoleDestinations(["admin", "god", "player"]).map(({ href }) => href),
    "/heavens/campaigns/new",
    "/heavens/characters/42",
    "/heavens/npcs/42",
    "/realms/characters/42/random/guided",
  ]);

  for (const destination of destinations) {
    const sourceRoute = destination
      .replace(/^\/heavens\/characters\/\d+/, "/heavens/characters/[characterId]")
      .replace(/^\/heavens\/npcs\/\d+/, "/heavens/npcs/[npcId]")
      .replace(/^\/realms\/characters\/\d+/, "/realms/characters/[characterId]");
    const pageFile = join(
      process.cwd(),
      "src",
      "app",
      ...sourceRoute.split("/").filter(Boolean),
      "page.tsx",
    );
    assert.equal(existsSync(pageFile), true, `${destination} is missing ${pageFile}`);
  }
});
