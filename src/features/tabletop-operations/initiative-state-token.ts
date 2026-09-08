import { createHash } from "node:crypto";
import type { InitiativeEngineState } from "./initiative-runtime";

/** A compare-before-write token, including pending work rather than just the clock. */
export function initiativeStateToken(state: InitiativeEngineState): string {
  return createHash("sha256").update(JSON.stringify({ runtime: state.runtime,
    participants: [...state.participants].sort((a, b) => a.characterId - b.characterId),
    pendingActions: [...state.pendingActions].sort((a, b) => a.id - b.id) })).digest("hex");
}

export function assertExpectedInitiativeState(state: InitiativeEngineState, expectedToken: string): void {
  if (typeof expectedToken !== "string" || expectedToken !== initiativeStateToken(state)) {
    throw new Error("Combat state changed or this request already completed. Refresh before advancing Initiative.");
  }
}
