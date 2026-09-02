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
  npcsControlled: AdminUserCharacterSummary[];
  counts: {
    campaignsCreated: number;
    campaignsJoined: number;
    playerCharacters: number;
    npcsControlled: number;
  };
};

type AdminUserCharacterRow = AdminUserCharacterSummary & {
  isNpc: boolean;
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
  const npcsControlled: AdminUserCharacterSummary[] = [];

  for (const { isNpc, ...character } of input.characters) {
    if (isNpc) {
      npcsControlled.push(character);
    } else {
      playerCharacters.push(character);
    }
  }

  return {
    account: input.account,
    roles,
    campaignsCreated: input.campaignsCreated,
    campaignsJoined: input.campaignsJoined,
    playerCharacters,
    npcsControlled,
    counts: {
      campaignsCreated: input.campaignsCreated.length,
      campaignsJoined: input.campaignsJoined.length,
      playerCharacters: playerCharacters.length,
      npcsControlled: npcsControlled.length,
    },
  };
}
