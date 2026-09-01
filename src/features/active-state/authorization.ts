export type ActiveHealthAccessSubject = {
  userId: string;
  roles: readonly string[];
};

export type ActiveHealthAccessEntity = {
  playerUserId: string;
  campaignOwnerUserId: string;
  isNpc: boolean;
  isCampaignMember: boolean;
};

export function canMutateActiveHealth(
  subject: ActiveHealthAccessSubject,
  entity: ActiveHealthAccessEntity,
): boolean {
  const ownsCampaign =
    subject.roles.includes("god") && subject.userId === entity.campaignOwnerUserId;
  if (ownsCampaign) return true;
  return (
    subject.roles.includes("player") &&
    !entity.isNpc &&
    entity.isCampaignMember &&
    subject.userId === entity.playerUserId
  );
}
