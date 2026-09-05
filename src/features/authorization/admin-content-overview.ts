export type AdminContentStatus = "active" | "archived";

export type AdminContentAccountRow = {
  id: string;
  name: string;
  username: string | null;
  displayUsername: string | null;
};

export type AdminContentCampaignRow = {
  id: number;
  name: string;
  createdByUserId: string;
  archivedAt: Date | null;
  archiveReason: string;
};

export type AdminContentCharacterRow = {
  id: number;
  name: string;
  campaignId: number;
  campaignName: string;
  campaignArchivedAt: Date | null;
  campaignOwnerUserId: string;
  controllerUserId: string;
  isNpc: boolean;
  npcKind: string;
  npcBuildMode: string | null;
  npcRoleLabel: string;
  archivedAt: Date | null;
  archiveReason: string;
};

export type AdminSharedCatalogCount = {
  key: "races" | "creatures" | "skills" | "items" | "derived-abilities";
  label: string;
  href: string;
  active: number;
  archived: number;
  total: number;
};

export type AdminContentAccountReference = {
  id: string;
  label: string;
};

export type AdminContentCampaignSummary = {
  id: number;
  name: string;
  status: AdminContentStatus;
  archiveReason: string;
  owner: AdminContentAccountReference;
};

export type AdminContentCharacterSummary = {
  id: number;
  name: string;
  status: AdminContentStatus;
  archiveReason: string;
  campaign: {
    id: number;
    name: string;
    status: AdminContentStatus;
  };
  campaignOwner: AdminContentAccountReference;
  controller: AdminContentAccountReference;
  roleLabel: string;
  buildMode: "simple" | "detailed" | null;
};

export type AdminContentStatusCounts = {
  active: number;
  archived: number;
  total: number;
};

export type AdminContentOverview = {
  campaigns: AdminContentCampaignSummary[];
  playerCharacters: AdminContentCharacterSummary[];
  raceNpcs: AdminContentCharacterSummary[];
  creatureNpcs: AdminContentCharacterSummary[];
  sharedCatalogs: AdminSharedCatalogCount[];
  counts: {
    campaigns: AdminContentStatusCounts;
    playerCharacters: AdminContentStatusCounts;
    raceNpcs: AdminContentStatusCounts;
    creatureNpcs: AdminContentStatusCounts;
  };
};

function status(archivedAt: Date | null): AdminContentStatus {
  return archivedAt === null ? "active" : "archived";
}

function accountLabel(account: AdminContentAccountRow | undefined, id: string): string {
  if (!account) return `Unknown account (${id})`;
  const handle = account.displayUsername?.trim() || account.username?.trim();
  return handle && handle !== account.name
    ? `${account.name} (${handle})`
    : account.name;
}

function countStatuses(records: Array<{ status: AdminContentStatus }>): AdminContentStatusCounts {
  const active = records.filter((record) => record.status === "active").length;
  const archived = records.length - active;
  return { active, archived, total: records.length };
}

export function buildAdminContentOverview(input: {
  accounts: AdminContentAccountRow[];
  campaigns: AdminContentCampaignRow[];
  characters: AdminContentCharacterRow[];
  sharedCatalogs: Array<Omit<AdminSharedCatalogCount, "total">>;
}): AdminContentOverview {
  const accounts = new Map(input.accounts.map((account) => [account.id, account]));
  const reference = (id: string): AdminContentAccountReference => ({
    id,
    label: accountLabel(accounts.get(id), id),
  });

  const campaigns = input.campaigns.map((entry) => ({
    id: entry.id,
    name: entry.name,
    status: status(entry.archivedAt),
    archiveReason: entry.archiveReason,
    owner: reference(entry.createdByUserId),
  }));
  const playerCharacters: AdminContentCharacterSummary[] = [];
  const raceNpcs: AdminContentCharacterSummary[] = [];
  const creatureNpcs: AdminContentCharacterSummary[] = [];

  for (const entry of input.characters) {
    const character: AdminContentCharacterSummary = {
      id: entry.id,
      name: entry.name,
      status: status(entry.archivedAt),
      archiveReason: entry.archiveReason,
      campaign: {
        id: entry.campaignId,
        name: entry.campaignName,
        status: status(entry.campaignArchivedAt),
      },
      campaignOwner: reference(entry.campaignOwnerUserId),
      controller: reference(entry.controllerUserId),
      roleLabel: entry.npcRoleLabel,
      buildMode: entry.isNpc && entry.npcBuildMode === "simple" ? "simple" : entry.isNpc ? "detailed" : null,
    };
    if (!entry.isNpc) playerCharacters.push(character);
    else if (entry.npcKind === "creature") creatureNpcs.push(character);
    else raceNpcs.push(character);
  }

  const sharedCatalogs = input.sharedCatalogs.map((catalog) => ({
    ...catalog,
    total: catalog.active + catalog.archived,
  }));

  return {
    campaigns,
    playerCharacters,
    raceNpcs,
    creatureNpcs,
    sharedCatalogs,
    counts: {
      campaigns: countStatuses(campaigns),
      playerCharacters: countStatuses(playerCharacters),
      raceNpcs: countStatuses(raceNpcs),
      creatureNpcs: countStatuses(creatureNpcs),
    },
  };
}
