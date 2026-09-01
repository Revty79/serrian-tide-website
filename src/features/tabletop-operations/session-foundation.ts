export const SESSION_STATUSES = ["planned", "active", "completed"] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionTransition = "start" | "complete" | "reopen";

export type SessionMetadataInput = {
  title: string;
  sequenceNumber: number;
  plannedFor: string | null;
  godNotes: string;
};

export type SessionLifecycleState = {
  status: SessionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

const PLANNED_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizePlannedDate(value: string | null): string | null {
  const plannedFor = value?.trim() ?? "";
  if (!plannedFor) return null;
  const match = plannedFor.match(PLANNED_DATE_PATTERN);
  if (!match) throw new Error("Planned Date must be a valid calendar date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error("Planned Date must be a valid calendar date.");
  }
  return plannedFor;
}

export function normalizeSessionMetadata(input: SessionMetadataInput): SessionMetadataInput {
  const title = input.title.trim();
  if (!title) throw new Error("Session Title is required.");
  if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber <= 0) {
    throw new Error("Session Number must be a positive whole number.");
  }
  return {
    title,
    sequenceNumber: input.sequenceNumber,
    plannedFor: normalizePlannedDate(input.plannedFor),
    godNotes: input.godNotes,
  };
}

export function transitionSession(
  current: SessionLifecycleState,
  transition: SessionTransition,
  now = new Date(),
): SessionLifecycleState {
  if (transition === "start" && current.status === "planned") {
    return { status: "active", startedAt: now, completedAt: null };
  }
  if (transition === "complete" && current.status === "active") {
    return { status: "completed", startedAt: current.startedAt ?? now, completedAt: now };
  }
  if (transition === "reopen" && current.status === "completed") {
    return { status: "active", startedAt: current.startedAt ?? now, completedAt: null };
  }
  throw new Error(`A ${current.status} Session cannot be ${transition === "complete" ? "completed" : `${transition}ed`}.`);
}

export function assertSessionMayBeDeleted(status: SessionStatus): void {
  if (status !== "planned") {
    throw new Error("Only a planned Session may be deleted.");
  }
}

export function assertSessionIsEditable(status: SessionStatus): void {
  if (status === "completed") {
    throw new Error("A completed Session is read-only. Reopen it before making changes.");
  }
}

export function assertCampaignSessionOwner(
  campaignOwnerUserId: string,
  actingUserId: string,
): void {
  if (campaignOwnerUserId !== actingUserId) {
    throw new Error("Only the Campaign creator can manage its Sessions.");
  }
}

export function assertNoOtherActiveSession(
  activeSessionIds: readonly number[],
  targetSessionId: number,
): void {
  if (activeSessionIds.some((sessionId) => sessionId !== targetSessionId)) {
    throw new Error("This Campaign already has an active Session. Complete it before starting another.");
  }
}

export function getNextSessionSequence(
  sessions: ReadonlyArray<{ sequenceNumber: number }>,
): number {
  return Math.max(0, ...sessions.map(({ sequenceNumber }) => sequenceNumber)) + 1;
}
