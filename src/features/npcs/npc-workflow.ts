import {
  assertOwnedRootManager,
  canManageOwnedRoot,
} from "@/features/lifecycle/policy";

export const NPC_ORIGINS = ["race", "creature"] as const;
export const NPC_BUILD_MODES = ["simple", "detailed"] as const;
export const NPC_ARCHIVE_STATUSES = ["active", "archived"] as const;

export type NpcOrigin = (typeof NPC_ORIGINS)[number];
export type NpcBuildMode = (typeof NPC_BUILD_MODES)[number];
export type NpcArchiveStatus = (typeof NPC_ARCHIVE_STATUSES)[number];
export type NpcManagerRole = "admin" | "god" | "player";

export type CreateNpcValues = {
  campaignId: number;
  origin: NpcOrigin;
  buildMode: NpcBuildMode;
  sourceId: number;
  name: string;
  roleLabel: string;
  personalityDescription?: string;
  notes?: string;
};

export type NormalizedCreateNpcValues = Omit<
  CreateNpcValues,
  "name" | "roleLabel" | "personalityDescription" | "notes"
> & {
  name: string;
  roleLabel: string;
  personalityDescription: string;
  notes: string;
};

export type NpcSearchRecord = {
  name: string;
  roleLabel: string;
  sourceName: string;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must identify a saved record.`);
  }
  return value;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function normalizeCreateNpcValues(
  input: CreateNpcValues,
): NormalizedCreateNpcValues {
  if (!NPC_ORIGINS.includes(input.origin)) {
    throw new Error("NPC Origin must be Race or Creature.");
  }
  if (!NPC_BUILD_MODES.includes(input.buildMode)) {
    throw new Error("NPC Build Mode must be Simple or Detailed.");
  }
  return {
    campaignId: positiveId(input.campaignId, "Campaign"),
    origin: input.origin,
    buildMode: input.buildMode,
    sourceId: positiveId(input.sourceId, "NPC Source"),
    name: requiredText(input.name, "NPC Name"),
    roleLabel: requiredText(input.roleLabel, "NPC Role / Label"),
    personalityDescription: input.personalityDescription?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
  };
}

export function normalizeSimpleNpcValues(input: {
  characterId: number;
  campaignId: number;
  name: string;
  roleLabel: string;
  personalityDescription: string;
  notes: string;
}) {
  return {
    characterId: positiveId(input.characterId, "NPC"),
    campaignId: positiveId(input.campaignId, "Campaign"),
    name: requiredText(input.name, "NPC Name"),
    roleLabel: requiredText(input.roleLabel, "NPC Role / Label"),
    personalityDescription: input.personalityDescription.trim(),
    notes: input.notes.trim(),
  };
}

export function canManageNpc(input: {
  actorUserId: string;
  campaignOwnerUserId: string;
  roles: readonly NpcManagerRole[];
}): boolean {
  return canManageOwnedRoot(
    { userId: input.actorUserId, roles: input.roles },
    input.campaignOwnerUserId,
  );
}

export function assertCanManageNpc(input: {
  actorUserId: string;
  campaignOwnerUserId: string;
  roles: readonly NpcManagerRole[];
}): void {
  assertOwnedRootManager(
    { userId: input.actorUserId, roles: input.roles },
    input.campaignOwnerUserId,
    "Campaign",
  );
}

export function matchesNpcSearch(
  record: NpcSearchRecord,
  rawSearch: string,
): boolean {
  const search = rawSearch.trim().toLocaleLowerCase("en-US");
  if (!search) return true;
  return [record.name, record.roleLabel, record.sourceName].some((value) => (
    value.toLocaleLowerCase("en-US").includes(search)
  ));
}

export function getDetailedNpcHref(input: {
  campaignId: number;
  characterId: number;
  origin: NpcOrigin;
}): string {
  const campaignId = positiveId(input.campaignId, "Campaign");
  const characterId = positiveId(input.characterId, "NPC");
  return input.origin === "creature"
    ? `/heavens/npcs/${characterId}`
    : `/heavens/characters/${characterId}?source=npcs&campaign=${campaignId}`;
}

export function assertNpcCanBeChanged(input: {
  archivedAt: Date | string | null;
  operation: "save" | "upgrade";
}): void {
  if (input.archivedAt !== null) {
    throw new Error(
      `Archived NPCs are read-only. Restore this NPC before you ${input.operation} it.`,
    );
  }
}

export function needsNpcUpgrade(buildMode: NpcBuildMode): boolean {
  return buildMode === "simple";
}
