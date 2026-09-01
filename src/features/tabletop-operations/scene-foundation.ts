import type { SessionStatus } from "./session-foundation";

export const SCENE_STATUSES = ["planned", "active", "completed"] as const;

export type SceneStatus = (typeof SCENE_STATUSES)[number];
export type SceneTransition = "start" | "complete" | "reopen";

export type SceneMetadataInput = {
  sequenceNumber: number;
  title: string;
  locationLabel: string;
  description: string;
  godNotes: string;
};

export type SceneLifecycleState = {
  status: SceneStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type SceneMemberOrderEntry = {
  characterId: number;
  sortOrder: number;
};

function normalizeAuthoredText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function normalizeSceneMetadata(input: SceneMetadataInput): SceneMetadataInput {
  const title = input.title.trim();
  if (!title) throw new Error("Scene Title is required.");
  if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber <= 0) {
    throw new Error("Scene Number must be a positive whole number.");
  }
  return {
    sequenceNumber: input.sequenceNumber,
    title,
    locationLabel: input.locationLabel.trim(),
    description: normalizeAuthoredText(input.description),
    godNotes: normalizeAuthoredText(input.godNotes),
  };
}

export function transitionScene(
  current: SceneLifecycleState,
  transition: SceneTransition,
  now = new Date(),
): SceneLifecycleState {
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
  throw new Error(`A ${current.status} Scene cannot be ${verb}.`);
}

export function assertParentSessionAllowsScenePreparation(status: SessionStatus): void {
  if (status === "completed") {
    throw new Error("A completed Session is historical. Reopen it before changing Scenes.");
  }
}

export function assertSceneIsEditable(
  sceneStatus: SceneStatus,
  sessionStatus: SessionStatus,
): void {
  assertParentSessionAllowsScenePreparation(sessionStatus);
  if (sceneStatus === "completed") {
    throw new Error("A completed Scene is read-only. Reopen it before making changes.");
  }
}

export function assertSceneMayStart(sessionStatus: SessionStatus): void {
  if (sessionStatus !== "active") {
    throw new Error("A Scene may be started only while its Session is active.");
  }
}

export function assertSceneMayComplete(sessionStatus: SessionStatus): void {
  if (sessionStatus !== "active") {
    throw new Error("A Scene may be completed only while its Session is active.");
  }
}

export function assertSceneMayReopen(sessionStatus: SessionStatus): void {
  if (sessionStatus !== "active") {
    throw new Error("A Scene may be reopened only while its Session is active.");
  }
}

export function assertSceneMayBeDeleted(status: SceneStatus): void {
  if (status !== "planned") throw new Error("Only a planned Scene may be deleted.");
}

export function assertNoOtherActiveScene(
  activeSceneIds: readonly number[],
  targetSceneId: number,
): void {
  if (activeSceneIds.some((sceneId) => sceneId !== targetSceneId)) {
    throw new Error("This Session already has an active Scene. Complete it before starting another.");
  }
}

export function assertSceneMemberBelongsToRoster(
  sceneSessionId: number,
  rosterSessionId: number,
): void {
  if (sceneSessionId !== rosterSessionId) {
    throw new Error("A Scene member must already belong to that Session's Roster.");
  }
}

export function normalizeSceneMemberOrder(
  entries: readonly SceneMemberOrderEntry[],
): SceneMemberOrderEntry[] {
  return [...entries]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.characterId - right.characterId)
    .map((entry, sortOrder) => ({ characterId: entry.characterId, sortOrder }));
}

export function moveSceneMember(
  entries: readonly SceneMemberOrderEntry[],
  characterId: number,
  direction: "up" | "down",
): SceneMemberOrderEntry[] {
  const ordered = normalizeSceneMemberOrder(entries);
  const currentIndex = ordered.findIndex((entry) => entry.characterId === characterId);
  if (currentIndex < 0) throw new Error("That Character is not in the Scene.");
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= ordered.length) return ordered;
  const moved = [...ordered];
  [moved[currentIndex], moved[targetIndex]] = [moved[targetIndex]!, moved[currentIndex]!];
  return moved.map((entry, sortOrder) => ({ ...entry, sortOrder }));
}

export function getNextSceneSequence(
  scenes: ReadonlyArray<{ sequenceNumber: number }>,
): number {
  return Math.max(0, ...scenes.map(({ sequenceNumber }) => sequenceNumber)) + 1;
}
