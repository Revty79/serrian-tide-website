import type { SerrianRole } from "@/db/authorization-schema";
import { canManageCharacterSheet } from "@/features/characters/character-sheet-access";
import {
  canManageCampaignRecords,
  canOperateCampaignState,
} from "@/features/active-state/authorization";

export type ManagedCharacterAccess = {
  canManageRecord: boolean;
  canOperateRuntime: boolean;
  canAccessPrivateGod: boolean;
};

export function resolveManagedCharacterAccess(input: {
  actorUserId: string;
  roles: readonly SerrianRole[];
  campaignOwnerUserId: string;
}): ManagedCharacterAccess {
  const subject = { userId: input.actorUserId, roles: input.roles };

  return {
    canAccessPrivateGod: canManageCharacterSheet(input.actorUserId, input.campaignOwnerUserId),
    canManageRecord: canManageCampaignRecords(subject, input.campaignOwnerUserId),
    canOperateRuntime: canOperateCampaignState(subject, input.campaignOwnerUserId),
  };
}
