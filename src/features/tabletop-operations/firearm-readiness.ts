import { resolveFirearmFiringMode, type ResolvedFirearmFiringMode } from "@/features/items/firearm-timing";

export const FIREARM_PREPARATION_OPERATIONS = [
  "draw",
  "ready",
  "load",
  "reload",
  "unload",
  "change-mode",
  "cycle",
  "recover-recoil",
] as const;

export const FIREARM_PARTIAL_LOAD_DISPOSITIONS = ["none", "retain", "discard"] as const;

export type FirearmPreparationOperation = (typeof FIREARM_PREPARATION_OPERATIONS)[number];
export type FirearmPartialLoadDisposition = (typeof FIREARM_PARTIAL_LOAD_DISPOSITIONS)[number];
export type FirearmReadinessStatus =
  | "ready"
  | "not-ready"
  | "preparation-pending"
  | "requires-god-ruling"
  | "invalid-state";

export type FirearmReadinessBlockerCode =
  | "runtime-uninitialized"
  | "not-drawn"
  | "not-readied"
  | "wrong-owner"
  | "missing-item-instance"
  | "missing-weapon-profile"
  | "invalid-firing-mode"
  | "no-ammunition"
  | "incompatible-ammunition"
  | "insufficient-rounds"
  | "missing-capacity"
  | "missing-readiness-relationship"
  | "over-capacity"
  | "cycling-required"
  | "recoil-recovery-required"
  | "reload-pending"
  | "preparation-pending"
  | "preparation-interrupted"
  | "missing-initiative-cost"
  | "stale-canonical-runtime-divergence"
  | "unsupported-creature-firearm";

export type FirearmReadinessBlocker = Readonly<{
  code: FirearmReadinessBlockerCode;
  message: string;
  classification: "not-ready" | "pending" | "ruling" | "invalid";
}>;

export type FirearmReadinessInput = Readonly<{
  initialized: boolean;
  exactOwnerValid: boolean;
  itemInstancePresent: boolean;
  weaponProfilePresent: boolean;
  firingModeValid: boolean;
  firingModeMechanicsResolved: boolean;
  drawn: boolean;
  readied: boolean;
  loadedRounds: number;
  capacityRounds: number | null;
  readinessRelationshipResolved: boolean;
  ammunitionRelationshipResolved: boolean;
  ammunitionRequired: boolean;
  ammunitionCompatible: boolean;
  roundsRequiredForSelectedDelivery: number | null;
  requiresCycling: boolean;
  requiresRecoilRecovery: boolean;
  pendingPreparation: null | Readonly<{
    operation: FirearmPreparationOperation;
    status: "pending" | "interrupted" | "requires-god-ruling";
  }>;
  requiredPreparationInitiativeCostKnown: boolean;
  staleCanonicalRuntimeDivergence: boolean;
  directCreatureManufacturedFirearm: boolean;
}>;

const blocker = (
  code: FirearmReadinessBlockerCode,
  message: string,
  classification: FirearmReadinessBlocker["classification"],
): FirearmReadinessBlocker => ({ code, message, classification });

function nonNegativeWhole(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a whole number zero or greater.`);
  return value;
}

export function evaluateFirearmReadiness(input: FirearmReadinessInput): {
  status: FirearmReadinessStatus;
  blockers: FirearmReadinessBlocker[];
} {
  const blockers: FirearmReadinessBlocker[] = [];
  if (input.directCreatureManufacturedFirearm) blockers.push(blocker(
    "unsupported-creature-firearm",
    "Direct encounter Creatures do not have Character-owned firearm instances; manufactured firearm use requires a G.O.D. ruling.",
    "ruling",
  ));
  if (!input.initialized) blockers.push(blocker(
    "runtime-uninitialized",
    "This exact firearm copy has no explicit runtime state. It has not been guessed as loaded, empty, drawn, or ready.",
    "ruling",
  ));
  if (!input.exactOwnerValid) blockers.push(blocker("wrong-owner", "The exact firearm copy does not belong to this Character.", "invalid"));
  if (!input.itemInstancePresent) blockers.push(blocker("missing-item-instance", "The exact owned Item instance is unavailable.", "invalid"));
  if (!input.weaponProfilePresent) blockers.push(blocker("missing-weapon-profile", "The canonical Weapon Profile is unavailable.", "invalid"));
  if (!input.firingModeValid) blockers.push(blocker("invalid-firing-mode", "The selected Firing Mode does not belong to this Weapon Profile.", "invalid"));
  if (input.staleCanonicalRuntimeDivergence) blockers.push(blocker(
    "stale-canonical-runtime-divergence",
    "The frozen firearm state no longer agrees with current canonical authored data and requires audited review.",
    "invalid",
  ));
  if (input.capacityRounds === null) blockers.push(blocker("missing-capacity", "No authoritative round capacity is available.", "ruling"));
  if (!input.readinessRelationshipResolved) blockers.push(blocker(
    "missing-readiness-relationship",
    "No authoritative relationship between drawing and readying is available.",
    "ruling",
  ));
  if (!input.ammunitionRelationshipResolved) blockers.push(blocker(
    "incompatible-ammunition",
    "The Weapon Profile has no exact supported ammunition relationship.",
    "ruling",
  ));
  if (input.capacityRounds !== null && input.loadedRounds > input.capacityRounds) blockers.push(blocker("over-capacity", "Loaded rounds exceed the frozen authoritative capacity.", "invalid"));
  if (!input.firingModeMechanicsResolved) blockers.push(blocker(
    "invalid-firing-mode",
    "The selected Firing Mode delivery or follow-up timing is still review-required.",
    "ruling",
  ));
  if (!input.drawn) blockers.push(blocker("not-drawn", "The exact firearm copy is not drawn or wielded.", "not-ready"));
  if (!input.readied) blockers.push(blocker("not-readied", "The exact firearm copy has not completed its authored readiness requirement.", "not-ready"));
  if (input.ammunitionRequired && input.loadedRounds === 0) blockers.push(blocker("no-ammunition", "The firearm has no loaded ammunition.", "not-ready"));
  if (input.loadedRounds > 0 && !input.ammunitionCompatible) blockers.push(blocker(
    "incompatible-ammunition",
    "Loaded ammunition does not match the Weapon Profile's exact canonical ammunition relationship.",
    "invalid",
  ));
  if (
    input.roundsRequiredForSelectedDelivery !== null
    && input.loadedRounds > 0
    && input.loadedRounds < input.roundsRequiredForSelectedDelivery
  ) blockers.push(blocker(
    "insufficient-rounds",
    `The selected delivery requires ${input.roundsRequiredForSelectedDelivery} rounds, but only ${input.loadedRounds} are loaded.`,
    "not-ready",
  ));
  if (input.requiresCycling) blockers.push(blocker("cycling-required", "The firearm requires its authored cycling step.", "not-ready"));
  if (input.requiresRecoilRecovery) blockers.push(blocker("recoil-recovery-required", "The firearm requires its authored recoil-recovery step.", "not-ready"));
  if (input.pendingPreparation?.status === "interrupted") blockers.push(blocker(
    "preparation-interrupted",
    `The ${input.pendingPreparation.operation} preparation was interrupted and has not completed.`,
    "pending",
  ));
  if (input.pendingPreparation?.status === "requires-god-ruling") blockers.push(blocker(
    "missing-initiative-cost",
    `The ${input.pendingPreparation.operation} preparation requires an explicit G.O.D. timing ruling.`,
    "ruling",
  ));
  if (input.pendingPreparation?.status === "pending") blockers.push(blocker(
    input.pendingPreparation.operation === "load" || input.pendingPreparation.operation === "reload"
      ? "reload-pending"
      : "preparation-pending",
    `The ${input.pendingPreparation.operation} preparation is still in progress.`,
    "pending",
  ));
  if (!input.requiredPreparationInitiativeCostKnown) blockers.push(blocker(
    "missing-initiative-cost",
    "The next objectively required preparation has no authored Initiative Cost.",
    "ruling",
  ));

  if (blockers.some(({ classification }) => classification === "invalid")) return { status: "invalid-state", blockers };
  if (blockers.some(({ classification }) => classification === "ruling")) return { status: "requires-god-ruling", blockers };
  if (blockers.some(({ classification }) => classification === "pending")) return { status: "preparation-pending", blockers };
  if (blockers.length) return { status: "not-ready", blockers };
  return { status: "ready", blockers };
}

export type FirearmAuthoredPreparationTiming = Readonly<{
  drawInitiativeCost: number | null;
  readyInitiativeCost: number | null;
  reloadInitiativeCost: number | null;
  unloadInitiativeCost: number | null;
  firingModeChangeInitiativeCost: number | null;
  selectedMode: ResolvedFirearmFiringMode | null;
}>;

export type FirearmPreparationTimingResolution =
  | Readonly<{ status: "resolved"; initiativeCost: number; source: "canonical" | "god-ruling"; reason: string }>
  | Readonly<{ status: "requires-god-ruling"; initiativeCost: null; source: null; reason: string }>;

export function resolveFirearmPreparationTiming(input: {
  operation: FirearmPreparationOperation;
  authored: FirearmAuthoredPreparationTiming;
  godInitiativeCost?: number | null;
  godReason?: string;
}): FirearmPreparationTimingResolution {
  if (!FIREARM_PREPARATION_OPERATIONS.includes(input.operation)) throw new Error("Firearm preparation operation is invalid.");
  const canonical = input.operation === "draw"
    ? input.authored.drawInitiativeCost
    : input.operation === "ready"
      ? input.authored.readyInitiativeCost
      : input.operation === "load" || input.operation === "reload"
        ? input.authored.reloadInitiativeCost
        : input.operation === "unload"
          ? input.authored.unloadInitiativeCost
          : input.operation === "change-mode"
            ? input.authored.firingModeChangeInitiativeCost
            : input.operation === "cycle"
              ? input.authored.selectedMode?.timing?.effectiveCyclingInitiativeCost ?? null
              : input.authored.selectedMode?.timing?.effectiveRecoilResetInitiativeCost ?? null;
  if (canonical !== null) {
    return { status: "resolved", initiativeCost: nonNegativeWhole(canonical, "Canonical Initiative Cost"), source: "canonical", reason: "" };
  }
  if (input.godInitiativeCost === null || input.godInitiativeCost === undefined) {
    return {
      status: "requires-god-ruling",
      initiativeCost: null,
      source: null,
      reason: `No authoritative ${input.operation} Initiative Cost is authored.`,
    };
  }
  const reason = input.godReason?.trim() ?? "";
  if (!reason) throw new Error("A G.O.D.-assigned Initiative Cost requires a reason.");
  return {
    status: "resolved",
    initiativeCost: nonNegativeWhole(input.godInitiativeCost, "G.O.D.-assigned Initiative Cost"),
    source: "god-ruling",
    reason,
  };
}

export type FirearmAmmunitionTransition = Readonly<{
  loadedRounds: number;
  inventoryRounds: number;
  retainedRounds: number;
  discardedRounds: number;
}>;

export function planFirearmAmmunitionTransition(input: {
  operation: "load" | "reload" | "unload";
  loadedRounds: number;
  inventoryRounds: number;
  capacityRounds: number | null;
  requestedRounds?: number | null;
  replaceCurrentLoad?: boolean;
  disposition?: FirearmPartialLoadDisposition;
  loadedAmmunitionItemId: number | null;
  requestedAmmunitionItemId: number | null;
  canonicalAmmunitionItemId: number | null;
}): FirearmAmmunitionTransition {
  const loaded = nonNegativeWhole(input.loadedRounds, "Loaded rounds");
  const inventory = nonNegativeWhole(input.inventoryRounds, "Inventory rounds");
  const capacity = input.capacityRounds;
  if (capacity === null) throw new Error("Firearm capacity requires a G.O.D. ruling before ammunition can change.");
  if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new Error("Firearm capacity must be a positive whole number.");
  if (loaded > capacity) throw new Error("The current firearm state is over capacity and requires correction.");
  const disposition = input.disposition ?? "none";
  if (!FIREARM_PARTIAL_LOAD_DISPOSITIONS.includes(disposition)) throw new Error("Partial-load disposition is invalid.");

  if (input.operation === "unload") {
    if (loaded === 0) throw new Error("An empty firearm has no ammunition to unload.");
    if (disposition === "none") throw new Error("Unloading requires an explicit retain or discard choice.");
    return {
      loadedRounds: 0,
      inventoryRounds: inventory + (disposition === "retain" ? loaded : 0),
      retainedRounds: disposition === "retain" ? loaded : 0,
      discardedRounds: disposition === "discard" ? loaded : 0,
    };
  }

  const requested = input.requestedRounds;
  if (!Number.isSafeInteger(requested) || (requested as number) <= 0) throw new Error("Rounds to load must be a positive whole number.");
  if (input.canonicalAmmunitionItemId === null) throw new Error("The Weapon Profile has no exact canonical ammunition relationship.");
  if (input.requestedAmmunitionItemId !== input.canonicalAmmunitionItemId) throw new Error("Incompatible ammunition cannot be loaded.");
  if (loaded > 0 && input.loadedAmmunitionItemId !== input.requestedAmmunitionItemId) {
    throw new Error("Incompatible ammunition types cannot be silently combined.");
  }
  if (input.operation === "load" && loaded > 0) throw new Error("Use reload to add to or replace a partial load.");

  const replace = input.operation === "reload" && input.replaceCurrentLoad === true;
  if (replace && loaded === 0 && disposition !== "none") {
    throw new Error("An empty firearm has no partial load to retain or discard.");
  }
  if (replace && loaded > 0 && disposition === "none") {
    throw new Error("Replacing a partial load requires an explicit retain or discard choice.");
  }
  if (!replace && disposition !== "none") throw new Error("A disposition applies only when replacing or unloading an existing load.");
  const retained = replace && disposition === "retain" ? loaded : 0;
  const discarded = replace && disposition === "discard" ? loaded : 0;
  const inventoryAfterDisposition = inventory + retained;
  if ((requested as number) > inventoryAfterDisposition) throw new Error("Inventory does not contain enough ammunition for this operation.");
  const nextLoaded = (replace ? 0 : loaded) + (requested as number);
  if (nextLoaded > capacity) throw new Error("Loading above the firearm's authoritative capacity is not allowed.");
  return {
    loadedRounds: nextLoaded,
    inventoryRounds: inventoryAfterDisposition - (requested as number),
    retainedRounds: retained,
    discardedRounds: discarded,
  };
}

export function resolveFirearmMode(input: {
  mode: Parameters<typeof resolveFirearmFiringMode>[0];
  ammunitionCyclingModifier: number;
  ammunitionRecoilModifier: number;
}): ResolvedFirearmFiringMode {
  return resolveFirearmFiringMode(
    input.mode,
    input.ammunitionCyclingModifier,
    input.ammunitionRecoilModifier,
  );
}
