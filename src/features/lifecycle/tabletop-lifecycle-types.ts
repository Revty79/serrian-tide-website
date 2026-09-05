import type { LifecycleDependency } from "./types";

export const TABLETOP_LIFECYCLE_ENTITY_KINDS = [
  "campaign-session",
  "scene",
  "encounter",
] as const;

export type TabletopLifecycleEntityKind =
  (typeof TABLETOP_LIFECYCLE_ENTITY_KINDS)[number];

export type TabletopLifecycleTargetInput = {
  entityKind: TabletopLifecycleEntityKind;
  entityId: number;
};

export type TabletopLifecycleStatus = "planned" | "active" | "completed";

export type TabletopLifecyclePreview = {
  entityKind: TabletopLifecycleEntityKind;
  entityId: number;
  entityName: string;
  campaignId: number;
  campaignName: string;
  ownerLabel: string;
  status: TabletopLifecycleStatus;
  canComplete: boolean;
  canReopen: boolean;
  canDelete: boolean;
  permanentDeletionEnabled: boolean;
  dependencies: LifecycleDependency[];
  blockers: string[];
};
