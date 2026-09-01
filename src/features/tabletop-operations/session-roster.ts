import { assertSessionIsEditable, type SessionStatus } from "./session-foundation";

export type SessionRosterEntityKind = "pc" | "race-npc" | "creature-npc";

export type SessionRosterReference = {
  sessionId: number;
  campaignId: number;
  characterId: number;
  sortOrder: number;
  prepNotes: string;
};

export type RosterOrderEntry = {
  characterId: number;
  sortOrder: number;
};

export function classifySessionRosterEntity(input: {
  isNpc: boolean;
  npcKind: string;
}): SessionRosterEntityKind {
  if (!input.isNpc) return "pc";
  return input.npcKind === "creature" ? "creature-npc" : "race-npc";
}

export function getSessionRosterEntityLabel(kind: SessionRosterEntityKind): string {
  if (kind === "pc") return "Player Character";
  if (kind === "creature-npc") return "Creature NPC";
  return "Race NPC";
}

export function assertRosterCampaignIntegrity(
  sessionCampaignId: number,
  characterCampaignId: number,
): void {
  if (sessionCampaignId !== characterCampaignId) {
    throw new Error("A Session may roster only Characters and NPCs from its own Campaign.");
  }
}

export function assertSessionRosterEditable(status: SessionStatus): void {
  assertSessionIsEditable(status);
}

export function normalizeRosterPrepNotes(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function normalizeRosterOrder(
  entries: readonly RosterOrderEntry[],
): RosterOrderEntry[] {
  return [...entries]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.characterId - right.characterId)
    .map((entry, sortOrder) => ({ characterId: entry.characterId, sortOrder }));
}

export function moveRosterEntry(
  entries: readonly RosterOrderEntry[],
  characterId: number,
  direction: "up" | "down",
): RosterOrderEntry[] {
  const ordered = normalizeRosterOrder(entries);
  const currentIndex = ordered.findIndex((entry) => entry.characterId === characterId);
  if (currentIndex < 0) throw new Error("That Character is not in the Session roster.");
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= ordered.length) return ordered;
  const moved = [...ordered];
  [moved[currentIndex], moved[targetIndex]] = [moved[targetIndex]!, moved[currentIndex]!];
  return moved.map((entry, sortOrder) => ({ ...entry, sortOrder }));
}
