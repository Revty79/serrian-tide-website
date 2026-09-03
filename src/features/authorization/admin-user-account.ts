import type { SerrianRole } from "@/db/authorization-schema";

export type AdminUserAccountIdentity = {
  id: string;
  name: string;
  username: string | null;
  displayUsername: string | null;
  email: string;
  createdAt: Date;
};

export type AdminUserCampaignSummary = {
  id: number;
  name: string;
};

export type AdminUserCharacterSummary = {
  id: number;
  name: string;
  campaignId: number;
  campaignName: string;
};

export type AdminUserAccountSummary = {
  account: AdminUserAccountIdentity;
  roles: SerrianRole[];
  campaignsCreated: AdminUserCampaignSummary[];
  campaignsJoined: AdminUserCampaignSummary[];
  playerCharacters: AdminUserCharacterSummary[];
  raceNpcsControlled: AdminUserCharacterSummary[];
  creatureNpcsControlled: AdminUserCharacterSummary[];
  counts: {
    campaignsCreated: number;
    campaignsJoined: number;
    playerCharacters: number;
    raceNpcsControlled: number;
    creatureNpcsControlled: number;
  };
};

type AdminUserCharacterRow = AdminUserCharacterSummary & {
  isNpc: boolean;
  npcKind: string;
};

const roleOrder: SerrianRole[] = ["admin", "god", "player"];

export function buildAdminUserAccountSummary(input: {
  account: AdminUserAccountIdentity;
  roles: SerrianRole[];
  campaignsCreated: AdminUserCampaignSummary[];
  campaignsJoined: AdminUserCampaignSummary[];
  characters: AdminUserCharacterRow[];
}): AdminUserAccountSummary {
  const roles = [...new Set(input.roles)].sort(
    (left, right) => roleOrder.indexOf(left) - roleOrder.indexOf(right),
  );
  const playerCharacters: AdminUserCharacterSummary[] = [];
  const raceNpcsControlled: AdminUserCharacterSummary[] = [];
  const creatureNpcsControlled: AdminUserCharacterSummary[] = [];

  for (const { isNpc, npcKind, ...character } of input.characters) {
    if (!isNpc) {
      playerCharacters.push(character);
    } else if (npcKind === "creature") {
      creatureNpcsControlled.push(character);
    } else {
      raceNpcsControlled.push(character);
    }
  }

  return {
    account: input.account,
    roles,
    campaignsCreated: input.campaignsCreated,
    campaignsJoined: input.campaignsJoined,
    playerCharacters,
    raceNpcsControlled,
    creatureNpcsControlled,
    counts: {
      campaignsCreated: input.campaignsCreated.length,
      campaignsJoined: input.campaignsJoined.length,
      playerCharacters: playerCharacters.length,
      raceNpcsControlled: raceNpcsControlled.length,
      creatureNpcsControlled: creatureNpcsControlled.length,
    },
  };
}
