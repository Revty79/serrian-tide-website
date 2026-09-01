import type { SceneStatus } from "./scene-foundation";
import type { SessionStatus } from "./session-foundation";

export const ENCOUNTER_STATUSES = ["planned", "active", "completed"] as const;
export const ENCOUNTER_TYPES = ["combat", "social", "exploration", "chase", "hazard", "other"] as const;

export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];
export type EncounterType = (typeof ENCOUNTER_TYPES)[number];
export type EncounterTransition = "start" | "complete" | "reopen";

export type EncounterMetadataInput = {
  sequenceNumber: number;
  title: string;
  encounterType: EncounterType;
  description: string;
  godNotes: string;
};

export type EncounterLifecycleState = {
  status: EncounterStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type ParticipantOrderEntry = {
  characterId: number;
  sortOrder: number;
};

function normalizeAuthoredText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function normalizeEncounterMetadata(input: EncounterMetadataInput): EncounterMetadataInput {
  const title = input.title.trim();
  if (!title) throw new Error("Encounter Title is required.");
  if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber <= 0) {
    throw new Error("Encounter Number must be a positive whole number.");
  }
  if (!ENCOUNTER_TYPES.includes(input.encounterType)) {
    throw new Error("Encounter Type is invalid.");
  }
  return {
    sequenceNumber: input.sequenceNumber,
    title,
    encounterType: input.encounterType,
    description: normalizeAuthoredText(input.description),
    godNotes: normalizeAuthoredText(input.godNotes),
  };
}

export function transitionEncounter(
  current: EncounterLifecycleState,
  transition: EncounterTransition,
  now = new Date(),
): EncounterLifecycleState {
  if (transition === "start" && current.status === "planned") {
    return { status: "active", startedAt: now, completedAt: null };
  }
  if (transition === "complete" && current.status === "active") {
    return { status: "completed", startedAt: current.startedAt ?? now, completedAt: now };
  }
  if (transition === "reopen" && current.status === "completed") {
    return { status: "active", startedAt: current.startedAt ?? now, completedAt: null };
  }
  const verb = transition === "complete" ? "completed" : `${transition}ed`;
  throw new Error(`A ${current.status} Encounter cannot be ${verb}.`);
}

export function assertParentsAllowEncounterPreparation(
  sessionStatus: SessionStatus,
  sceneStatus: SceneStatus,
): void {
  if (sessionStatus === "completed") {
    throw new Error("A completed Session is historical. Reopen it before changing Encounters.");
  }
  if (sceneStatus === "completed") {
    throw new Error("A completed Scene is historical. Reopen it before changing Encounters.");
  }
}

export function assertEncounterIsEditable(
  encounterStatus: EncounterStatus,
  sessionStatus: SessionStatus,
  sceneStatus: SceneStatus,
): void {
  assertParentsAllowEncounterPreparation(sessionStatus, sceneStatus);
  if (encounterStatus === "completed") {
    throw new Error("A completed Encounter is read-only. Reopen it before making changes.");
  }
}

export function assertParentsAllowLiveEncounter(
  sessionStatus: SessionStatus,
  sceneStatus: SceneStatus,
): void {
  if (sessionStatus !== "active" || sceneStatus !== "active") {
    throw new Error("An Encounter may be started, completed, or reopened only while its Session and Scene are active.");
  }
}

export function assertEncounterMayBeDeleted(status: EncounterStatus): void {
  if (status !== "planned") throw new Error("Only a planned Encounter may be deleted.");
}

export function assertNoOtherActiveEncounter(
  activeEncounterIds: readonly number[],
  targetEncounterId: number,
): void {
  if (activeEncounterIds.some((encounterId) => encounterId !== targetEncounterId)) {
    throw new Error("This Scene already has an active Encounter. Complete it before starting another.");
  }
}

export function assertParticipantBelongsToScene(
  encounterSceneId: number,
  memberSceneId: number,
): void {
  if (encounterSceneId !== memberSceneId) {
    throw new Error("An Encounter Participant must already belong to that Scene.");
  }
}

export function normalizeParticipantPrepNotes(value: string): string {
  return normalizeAuthoredText(value);
}

export function normalizeParticipantOrder(
  entries: readonly ParticipantOrderEntry[],
): ParticipantOrderEntry[] {
  return [...entries]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.characterId - right.characterId)
    .map((entry, sortOrder) => ({ characterId: entry.characterId, sortOrder }));
}

export function moveParticipant(
  entries: readonly ParticipantOrderEntry[],
  characterId: number,
  direction: "up" | "down",
): ParticipantOrderEntry[] {
  const ordered = normalizeParticipantOrder(entries);
  const currentIndex = ordered.findIndex((entry) => entry.characterId === characterId);
  if (currentIndex < 0) throw new Error("That Character is not an Encounter Participant.");
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= ordered.length) return ordered;
  const moved = [...ordered];
  [moved[currentIndex], moved[targetIndex]] = [moved[targetIndex]!, moved[currentIndex]!];
  return moved.map((entry, sortOrder) => ({ ...entry, sortOrder }));
}

export function getNextEncounterSequence(
  encounters: ReadonlyArray<{ sequenceNumber: number }>,
): number {
  return Math.max(0, ...encounters.map(({ sequenceNumber }) => sequenceNumber)) + 1;
}
