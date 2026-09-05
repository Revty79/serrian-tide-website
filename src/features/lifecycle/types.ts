export const LIFECYCLE_ENTITY_KINDS = [
  "campaign",
  "player-character",
  "race-npc",
  "creature-npc",
  "race",
  "creature",
  "skill",
  "item",
  "derived-ability",
] as const;

export type LifecycleEntityKind = (typeof LIFECYCLE_ENTITY_KINDS)[number];

export type LifecycleTargetInput = {
  entityKind: LifecycleEntityKind;
  entityId: number;
};

export type LifecycleDependency = {
  label: string;
  count: number;
  blocking: boolean;
};

export type LifecyclePreview = {
  entityKind: LifecycleEntityKind;
  entityId: number;
  entityName: string;
  campaignName?: string;
  ownerLabel?: string;
  archived: boolean;
  canonical: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
  permanentDeletionEnabled: boolean;
  dependencies: LifecycleDependency[];
  blockers: string[];
};

export type LifecycleActor = {
  userId: string;
  roles: readonly string[];
};

export type LifecycleDeletionResult = {
  entityKind: LifecycleEntityKind;
  entityId: number;
  entityName: string;
  campaignId?: number;
};
