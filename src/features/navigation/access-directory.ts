import type { SerrianAppRole } from "./authenticated-navigation";

export type AccessDestinationCard = {
  key: string;
  role?: SerrianAppRole;
  title: string;
  subtitle: string;
  href: string;
  description: string;
};

const ROLE_ACCESS_CARDS: readonly AccessDestinationCard[] = [
  {
    key: "admin",
    role: "admin",
    title: "ADMIN",
    subtitle: "System Administration",
    href: "/admin",
    description: "Manage Serrian Tide users, permissions, and system-level administration.",
  },
  {
    key: "heavens",
    role: "god",
    title: "THE HEAVENS",
    subtitle: "G.O.D. Access",
    href: "/heavens",
    description: "Enter the G.O.D. side of Serrian Tide to create, manage, and run the systems behind the world.",
  },
  {
    key: "realms",
    role: "player",
    title: "THE REALMS",
    subtitle: "Player Access",
    href: "/realms",
    description: "Enter the player-facing side of Serrian Tide for characters, campaigns, and play.",
  },
];

export const CROSSROADS_ACCESS_CARD: AccessDestinationCard = {
  key: "crossroads",
  title: "THE CROSSROADS",
  subtitle: "Communication Center",
  href: "/chat",
  description: "Join global discussions, continue Campaign conversations, and send direct messages from one shared workspace.",
};

export function getAccessDestinationCards(
  roles: readonly SerrianAppRole[],
): AccessDestinationCard[] {
  const roleSet = new Set(roles);
  if (roleSet.size === 0) return [];
  return [
    ...ROLE_ACCESS_CARDS.filter((card) => card.role && roleSet.has(card.role)),
    CROSSROADS_ACCESS_CARD,
  ];
}
