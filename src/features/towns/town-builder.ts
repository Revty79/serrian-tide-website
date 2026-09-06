export type TownArchiveStatus = "active" | "archived";

export type TownCoreValues = {
  campaignId: number;
  name: string;
  category: string;
  overview: string;
  locationNotes: string;
  godNotes: string;
};

export type TownPlaceValues = {
  townId: number;
  campaignId: number;
  name: string;
  category: string;
  description: string;
  locationNotes: string;
  godNotes: string;
};

export type TownNpcAssociationValues = {
  townId: number;
  campaignId: number;
  npcCharacterId: number;
  relationshipLabel: string;
  townNote: string;
};

export type TownSearchRecord = {
  name: string;
  category: string;
  overview: string;
  locationNotes: string;
};

export type TownPlaceSearchRecord = {
  name: string;
  category: string;
  description: string;
  locationNotes: string;
};

export type TownAssociationSearchRecord = {
  name: string;
  category?: string;
  roleLabel?: string;
  kind?: string;
  buildMode?: string;
  relationshipLabel?: string;
  note?: string;
};

export type TownNpcEligibilityRecord = {
  campaignId: number;
  isNpc: boolean;
  npcKind: string;
  npcBuildMode: string | null;
  archivedAt: Date | string | null;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must identify a saved record.`);
  }
  return value;
}

function boundedText(value: unknown, label: string, maximum: number, required = false): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} cannot exceed ${maximum.toLocaleString("en-US")} characters.`);
  return normalized;
}

export function normalizeTownCoreValues(input: TownCoreValues): TownCoreValues {
  return {
    campaignId: positiveId(input.campaignId, "Campaign"),
    name: boundedText(input.name, "Town name", 120, true),
    category: boundedText(input.category, "Town type / category", 120, true),
    overview: boundedText(input.overview, "Town overview", 5000),
    locationNotes: boundedText(input.locationNotes, "Town location notes", 1000),
    godNotes: boundedText(input.godNotes, "Town G.O.D. notes", 5000),
  };
}

export function normalizeTownPlaceValues(input: TownPlaceValues): TownPlaceValues {
  return {
    townId: positiveId(input.townId, "Town"),
    campaignId: positiveId(input.campaignId, "Campaign"),
    name: boundedText(input.name, "Place name", 120, true),
    category: boundedText(input.category, "Place type / category", 120),
    description: boundedText(input.description, "Place description", 5000),
    locationNotes: boundedText(input.locationNotes, "Place location notes", 1000),
    godNotes: boundedText(input.godNotes, "Place G.O.D. notes", 5000),
  };
}

export function normalizeTownNpcAssociationValues(
  input: TownNpcAssociationValues,
): TownNpcAssociationValues {
  return {
    townId: positiveId(input.townId, "Town"),
    campaignId: positiveId(input.campaignId, "Campaign"),
    npcCharacterId: positiveId(input.npcCharacterId, "NPC"),
    relationshipLabel: boundedText(input.relationshipLabel, "Town relationship", 160),
    townNote: boundedText(input.townNote, "Town NPC note", 1000),
  };
}

export function normalizeTownArchiveReason(reason?: string): string {
  return boundedText(reason, "Archive reason", 1000);
}

function includesSearch(values: Array<string | undefined>, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase("en-US");
  return !normalized || values.some((value) => value?.toLocaleLowerCase("en-US").includes(normalized));
}

export function matchesTownSearch(record: TownSearchRecord, search: string): boolean {
  return includesSearch([record.name, record.category, record.overview, record.locationNotes], search);
}

export function matchesTownPlaceSearch(record: TownPlaceSearchRecord, search: string): boolean {
  return includesSearch([record.name, record.category, record.description, record.locationNotes], search);
}

export function matchesTownAssociationSearch(record: TownAssociationSearchRecord, search: string): boolean {
  return includesSearch([
    record.name,
    record.category,
    record.roleLabel,
    record.kind,
    record.buildMode,
    record.relationshipLabel,
    record.note,
  ], search);
}

export function isEligibleTownNpc(record: TownNpcEligibilityRecord, campaignId: number): boolean {
  return record.campaignId === campaignId
    && record.isNpc
    && (record.npcKind === "race" || record.npcKind === "creature")
    && (record.npcBuildMode === "simple" || record.npcBuildMode === "detailed")
    && record.archivedAt === null;
}

const naturalNameCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

export function compareTownNames(
  left: { name: string; id: number },
  right: { name: string; id: number },
): number {
  return naturalNameCollator.compare(left.name, right.name) || left.id - right.id;
}
