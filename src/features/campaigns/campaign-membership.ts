import type { SerrianAppRole } from "@/features/navigation/authenticated-navigation";

export type CampaignPlayerIdentity = {
  userId: string;
  username: string;
  displayName: string;
};

export type CampaignPlayerRoleRow = CampaignPlayerIdentity & {
  role: SerrianAppRole | null;
};

export type CampaignPlayerCandidate = CampaignPlayerIdentity & {
  roles: SerrianAppRole[];
  isMember: boolean;
  isCampaignCreator: boolean;
};

export type CampaignScopedCharacter = {
  id: number;
  campaignId: number;
  playerUserId: string;
};

const ROLE_ORDER: SerrianAppRole[] = ["admin", "god", "player"];

export function buildCampaignPlayerCandidates(
  roleRows: readonly CampaignPlayerRoleRow[],
  memberUserIds: readonly string[],
  campaignCreatorUserId: string,
): CampaignPlayerCandidate[] {
  const identities = new Map<
    string,
    CampaignPlayerIdentity & { roles: Set<SerrianAppRole> }
  >();

  for (const row of roleRows) {
    const identity = identities.get(row.userId) ?? {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      roles: new Set<SerrianAppRole>(),
    };
    if (row.role) identity.roles.add(row.role);
    identities.set(row.userId, identity);
  }

  const members = new Set(memberUserIds);
  return [...identities.values()]
    .filter(({ roles }) => roles.has("player"))
    .map(({ roles, ...identity }) => ({
      ...identity,
      roles: ROLE_ORDER.filter((role) => roles.has(role)),
      isMember: members.has(identity.userId),
      isCampaignCreator: identity.userId === campaignCreatorUserId,
    }))
    .sort(
      (left, right) =>
        left.username.localeCompare(right.username, undefined, {
          sensitivity: "base",
          numeric: true,
        }) || left.userId.localeCompare(right.userId),
    );
}

export function canAdministerCampaign(
  campaignCreatorUserId: string,
  actingUserId: string,
) {
  return campaignCreatorUserId === actingUserId;
}

export function scopeCampaignCharacters<T extends CampaignScopedCharacter>(
  characters: readonly T[],
  campaignId: number,
  playerUserId: string,
) {
  return characters.filter(
    (character) =>
      character.campaignId === campaignId &&
      character.playerUserId === playerUserId,
  );
}

export function canCreateCharacterForPlayer(input: {
  campaignId: number;
  selectedCampaignId: number;
  playerUserId: string;
  selectedPlayerUserId: string;
  campaignMemberUserIds: readonly string[];
}) {
  return (
    input.campaignId === input.selectedCampaignId &&
    input.playerUserId === input.selectedPlayerUserId &&
    input.campaignMemberUserIds.includes(input.playerUserId)
  );
}

export function getCampaignPlayerPanelState(input: {
  loading: boolean;
  error: string;
  candidateCount: number;
}): "loading" | "error" | "empty" | "ready" {
  if (input.loading) return "loading";
  if (input.error) return "error";
  return input.candidateCount === 0 ? "empty" : "ready";
}

export function getAddedCampaignPlayerSelection(
  refreshed: {
    players: readonly { userId: string }[];
    candidates: readonly { userId: string; isMember: boolean }[];
  },
  addedUserId: string,
) {
  const linked = refreshed.players.some(({ userId }) => userId === addedUserId);
  const markedAdded = refreshed.candidates.some(
    ({ userId, isMember }) => userId === addedUserId && isMember,
  );
  return linked && markedAdded ? addedUserId : null;
}
