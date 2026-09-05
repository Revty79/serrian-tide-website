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

export function canManageCampaignRecords(
  subject: ActiveHealthAccessSubject,
  campaignOwnerUserId: string,
): boolean {
  return subject.roles.includes("admin")
    || (subject.roles.includes("god") && subject.userId === campaignOwnerUserId);
}

export function canOperateCampaignState(
  subject: ActiveHealthAccessSubject,
  campaignOwnerUserId: string,
): boolean {
  return subject.roles.includes("god") && subject.userId === campaignOwnerUserId;
}

export function assertCampaignRuntimeOperator(
  subject: ActiveHealthAccessSubject,
  campaignOwnerUserId: string,
  label: string,
): void {
  if (!canOperateCampaignState(subject, campaignOwnerUserId)) {
    throw new Error(`Only the Campaign-owning G.O.D. can operate live ${label} state.`);
  }
}

export function canMutateActiveHealth(
  subject: ActiveHealthAccessSubject,
  entity: ActiveHealthAccessEntity,
): boolean {
  if (canOperateCampaignState(subject, entity.campaignOwnerUserId)) return true;
  return (
    subject.roles.includes("player") &&
    !entity.isNpc &&
    entity.isCampaignMember &&
    subject.userId === entity.playerUserId
  );
}

export function canReadActiveState(
  subject: ActiveHealthAccessSubject,
  entity: ActiveHealthAccessEntity,
): boolean {
  return subject.roles.includes("admin") || canMutateActiveHealth(subject, entity);
}
