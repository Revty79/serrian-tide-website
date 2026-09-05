export type CampaignAccessKind = "owner" | "administrator";

export type CampaignAccessDesignation = {
  ownerUserId: string;
  ownerLabel: string;
  accessKind: CampaignAccessKind;
};

export function formatCampaignOwnerLabel(input: {
  name: string;
  username: string | null;
  displayUsername: string | null;
}): string {
  const handle = input.displayUsername?.trim() || input.username?.trim();
  return handle && handle !== input.name
    ? `${input.name} (${handle})`
    : input.name;
}

export function buildCampaignAccessDesignation(input: {
  actingUserId: string;
  ownerUserId: string;
  ownerName: string;
  ownerUsername: string | null;
  ownerDisplayUsername: string | null;
}): CampaignAccessDesignation {
  return {
    ownerUserId: input.ownerUserId,
    ownerLabel: formatCampaignOwnerLabel({
      name: input.ownerName,
      username: input.ownerUsername,
      displayUsername: input.ownerDisplayUsername,
    }),
    accessKind: input.ownerUserId === input.actingUserId
      ? "owner"
      : "administrator",
  };
}

export function campaignAccessLabel(
  campaign: Pick<CampaignAccessDesignation, "accessKind" | "ownerLabel">,
  administratorLabel = "Admin access",
): string {
  return campaign.accessKind === "owner"
    ? "Yours"
    : `${administratorLabel} · Owner: ${campaign.ownerLabel}`;
}

export function sortCampaignsByAccess<
  T extends { id: number; name: string; accessKind: CampaignAccessKind },
>(campaigns: readonly T[]): T[] {
  return [...campaigns].sort((left, right) => {
    if (left.accessKind !== right.accessKind) {
      return left.accessKind === "owner" ? -1 : 1;
    }
    return left.name.localeCompare(right.name) || left.id - right.id;
  });
}
