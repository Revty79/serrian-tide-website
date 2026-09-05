import { getCampaignControlHref } from "@/features/campaigns/campaign-workflow";

export type SerrianAppRole = "admin" | "god" | "player";
export type AuthenticatedContext = "admin" | "heavens" | "realms";

export type AuthenticatedNavigationItem = {
  label: string;
  href: string;
};

export type NavigationBreadcrumb = AuthenticatedNavigationItem & {
  current: boolean;
};

const CROSSROADS_ITEM: AuthenticatedNavigationItem = {
  label: "Crossroads",
  href: "/chat",
};

const CONTEXT_ITEMS: Record<AuthenticatedContext, AuthenticatedNavigationItem[]> = {
  admin: [
    { label: "Admin Dashboard", href: "/admin" },
    CROSSROADS_ITEM,
    { label: "Users & Roles", href: "/admin/users" },
  ],
  heavens: [
    { label: "Heavens Dashboard", href: "/heavens" },
    CROSSROADS_ITEM,
    { label: "Campaign Settings", href: "/heavens/campaigns" },
    { label: "Tabletop Operations", href: "/heavens/tabletop" },
    { label: "Races", href: "/heavens/races" },
    { label: "Skills", href: "/heavens/skills" },
    { label: "Derived Abilities", href: "/heavens/derived-abilities" },
    { label: "Creatures", href: "/heavens/creatures" },
    { label: "Equipment", href: "/heavens/equipment" },
    { label: "Inventory", href: "/heavens/inventory" },
    { label: "NPCs", href: "/heavens/npcs" },
  ],
  realms: [
    { label: "Realms Dashboard", href: "/realms" },
    { label: "Player Tabletop", href: "/realms/tabletop" },
    CROSSROADS_ITEM,
  ],
};

const ROLE_DESTINATIONS: Array<{
  role: SerrianAppRole;
  label: string;
  href: string;
}> = [
  { role: "admin", label: "Admin", href: "/admin" },
  { role: "god", label: "Heavens", href: "/heavens" },
  { role: "player", label: "Realms", href: "/realms" },
];

function getRealmsCharacterId(pathname?: string): number | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/realms\/characters\/(\d+)(?:\/|$)/);
  if (!match) return null;
  const characterId = Number(match[1]);
  return Number.isInteger(characterId) && characterId > 0 ? characterId : null;
}

export function getContextHomeHref(context: AuthenticatedContext) {
  return CONTEXT_ITEMS[context][0]!.href;
}

export function getContextNavigationItems(
  context: AuthenticatedContext,
  pathname?: string,
) {
  const baseItems = CONTEXT_ITEMS[context];
  const characterId = context === "realms" ? getRealmsCharacterId(pathname) : null;
  if (!characterId) return baseItems;

  const characterHref = `/realms/characters/${characterId}`;
  return [
    ...baseItems,
    { label: "Character Sheet", href: characterHref },
    { label: "Advancement", href: `${characterHref}/advance` },
    { label: "Spellbook", href: `${characterHref}/spellbook` },
    { label: "Magic Calculator", href: `${characterHref}/magic` },
  ];
}

export function getRoleDestinations(roles: readonly SerrianAppRole[]) {
  const roleSet = new Set(roles);
  return ROLE_DESTINATIONS.filter(({ role }) => roleSet.has(role));
}

export function getAlternateRoleDestinations(
  roles: readonly SerrianAppRole[],
  context: AuthenticatedContext,
) {
  const currentHref = getContextHomeHref(context);
  return getRoleDestinations(roles).filter(({ href }) => href !== currentHref);
}

export function isNavigationItemActive(
  pathname: string,
  item: AuthenticatedNavigationItem,
  characterSource?: string | null,
) {
  if (pathname === item.href) return true;
  if (/^\/realms\/characters\/\d+$/.test(item.href)) return false;
  if (
    item.href === "/heavens/npcs" &&
    pathname.startsWith("/heavens/characters/") &&
    characterSource === "npcs"
  ) {
    return true;
  }
  if (
    item.href === "/heavens" &&
    pathname.startsWith("/heavens/characters/") &&
    characterSource !== "npcs"
  ) {
    return true;
  }
  if (item.href === "/heavens" || item.href === "/realms" || item.href === "/admin") {
    return false;
  }
  return pathname.startsWith(`${item.href}/`);
}

export function getNavigationBreadcrumbs(
  pathname: string,
  context: AuthenticatedContext,
  characterSource?: string | null,
  campaignId?: number | null,
  playerUserId?: string | null,
): NavigationBreadcrumb[] {
  const contextRoot = CONTEXT_ITEMS[context][0]!;
  const breadcrumbs: AuthenticatedNavigationItem[] = [contextRoot];

  if (context === "heavens") {
    if (pathname.startsWith("/heavens/campaigns")) {
      breadcrumbs.push({ label: "Campaign Settings", href: "/heavens/campaigns" });
      if (pathname === "/heavens/campaigns/new") {
        breadcrumbs.push({ label: "Create Campaign", href: pathname });
      }
    } else if (pathname.startsWith("/heavens/characters/")) {
      breadcrumbs.push(
        characterSource === "npcs"
          ? { label: "NPCs", href: "/heavens/npcs" }
          : {
              label: "Campaign Control",
              href: getCampaignControlHref({ campaignId, playerUserId }),
            },
      );
      breadcrumbs.push({ label: "Character", href: pathname });
    } else if (pathname.startsWith("/heavens/npcs/")) {
      breadcrumbs.push({ label: "NPCs", href: "/heavens/npcs" });
      breadcrumbs.push({ label: "Creature Individual", href: pathname });
    } else {
      const active = CONTEXT_ITEMS.heavens.find((item) =>
        isNavigationItemActive(pathname, item, characterSource),
      );
      if (active && active.href !== contextRoot.href) breadcrumbs.push(active);
    }
  } else if (context === "realms" && pathname.startsWith("/realms/tabletop")) {
    breadcrumbs.push({ label: "Player Tabletop", href: "/realms/tabletop" });
  } else if (context === "realms" && pathname.startsWith("/realms/characters/")) {
    const parts = pathname.split("/").filter(Boolean);
    const characterHref = `/${parts.slice(0, 3).join("/")}`;
    breadcrumbs.push({ label: "Character", href: characterHref });
    const tool = parts[3];
    if (tool) {
      const labels: Record<string, string> = {
        advance: "Advancement",
        magic: "Magic Calculator",
        random: "Random Character",
        spellbook: "Spellbook",
      };
      breadcrumbs.push({ label: labels[tool] ?? "Character Tool", href: pathname });
    }
  } else if (context === "admin" && pathname.startsWith("/admin/users")) {
    breadcrumbs.push({ label: "Users & Roles", href: "/admin/users" });
  }

  return breadcrumbs.map((breadcrumb, index) => ({
    ...breadcrumb,
    current: index === breadcrumbs.length - 1,
  }));
}

export function getGodCharacterReturnHref(input: {
  source: "heavens" | "npcs";
  campaignId?: number | null;
  playerUserId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.campaignId && Number.isInteger(input.campaignId) && input.campaignId > 0) {
    params.set("campaign", String(input.campaignId));
  }
  if (input.playerUserId) params.set("player", input.playerUserId);

  if (input.source === "heavens") {
    return getCampaignControlHref({
      campaignId: input.campaignId,
      playerUserId: input.playerUserId,
    });
  }
  const base = "/heavens/npcs";
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function getCharacterToolReturnHref(characterId: number) {
  return Number.isInteger(characterId) && characterId > 0
    ? `/realms/characters/${characterId}`
    : "/realms";
}
