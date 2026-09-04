import {
  getDodgeInitiativeCost,
  resolveBlockParryInitiativeCosts,
  type PendingInitiativeActionState,
} from "./initiative-runtime";

export const AUTHORED_ACTION_SOURCE_KINDS = [
  "weapon",
  "creature-attack",
  "spell",
  "item",
  "creature-ability",
  "derived-ability",
  "skill",
  "attribute",
  "no-roll",
  "manual",
] as const;

export type AuthoredActionSourceKind = (typeof AUTHORED_ACTION_SOURCE_KINDS)[number];
export type AuthoredActionResolutionStatus = "pending" | "resolved" | "cancelled" | "needs-ruling";
export type EncounterReactionType = "dodge" | "block" | "parry" | "no-reaction" | "tackle" | "intervention";
export type EncounterReactionStatus = "declared" | "resolved" | "cancelled" | "needs-ruling";

export type AuthoredActionBinding<TPayload = unknown> = {
  id: number;
  pendingActionId: number;
  encounterId: number;
  sourceCharacterId: number;
  sourceKind: AuthoredActionSourceKind;
  sourceRef: string;
  sourceInstanceId: number | null;
  payload: TPayload;
  resolutionStatus: AuthoredActionResolutionStatus;
  resolvedAt: Date | null;
  resolutionSummary: string;
};

export type WeaponActionPayload = {
  targetCharacterId: number;
  itemId: number;
  instanceId: number | null;
};

export type CreatureAttackActionPayload = {
  targetCharacterId: number;
  attackCanonicalId: string;
};

export type ReactionResolution = {
  defenderFinalCost: number;
  defenderRefund: number;
  attackerAdditionalCost: number;
  attackPrevented: boolean;
};

const FORBIDDEN_DURABLE_PAYLOAD_KEYS = /(health|hp|mana|inventory|quantity|charge|attribute|skill|snapshot|currentInitiative|normalTotalInitiative)/i;

export function assertDurableAuthoredActionPayload(value: unknown, path = "payload"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertDurableAuthoredActionPayload(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_DURABLE_PAYLOAD_KEYS.test(key) && !/hitLocationNumber/i.test(key)) {
      throw new Error(`Authored action payload may not copy live Character state (${path}.${key}).`);
    }
    assertDurableAuthoredActionPayload(entry, `${path}.${key}`);
  }
}

export function buildCreatureSpawnNames(canonicalName: string, quantity: number): string[] {
  const name = canonicalName.trim();
  if (!name) throw new Error("Creature canonical name is required.");
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error("Creature quantity must be a whole number from 1 to 50.");
  }
  return quantity === 1
    ? [name]
    : Array.from({ length: quantity }, (_, index) => `${name} ${index + 1}`);
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

export function parseDirectNumericDamage(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const NATURAL_ACTION_COSTS = new Map<string, number>([
  ["punch", 2],
  ["fist", 2],
  ["bite", 2],
  ["grapple", 2],
  ["kick", 3],
  ["tail swipe", 4],
]);

function naturalActionKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

export function getUniversalNaturalActionInitiativeCost(attackName: string): number | null {
  return NATURAL_ACTION_COSTS.get(naturalActionKey(attackName)) ?? null;
}

export function resolveCreatureAttackInitiativeCost(input: {
  attackName: string;
  damage: string | number | null;
  structuredInitiativeCost?: number | null;
  godSuppliedInitiativeCost?: number | null;
}): { cost: number | null; source: "structured" | "natural" | "damage" | "god" | "missing" } {
  if (input.structuredInitiativeCost !== null && input.structuredInitiativeCost !== undefined) {
    return { cost: positive(input.structuredInitiativeCost, "Creature Attack Initiative Cost"), source: "structured" };
  }
  const natural = getUniversalNaturalActionInitiativeCost(input.attackName);
  if (natural !== null) return { cost: natural, source: "natural" };
  const damage = parseDirectNumericDamage(input.damage);
  if (damage !== null) return { cost: damage, source: "damage" };
  if (input.godSuppliedInitiativeCost !== null && input.godSuppliedInitiativeCost !== undefined) {
    return { cost: positive(input.godSuppliedInitiativeCost, "G.O.D. Initiative Cost"), source: "god" };
  }
  return { cost: null, source: "missing" };
}

export function requireReadyAuthoredAction(
  action: Pick<PendingInitiativeActionState, "status" | "remainingInitiativeCost">,
  bindingStatus: AuthoredActionResolutionStatus,
): void {
  if (bindingStatus !== "pending") throw new Error("This authored action has already been resolved or cancelled.");
  if (action.status !== "completed" || action.remainingInitiativeCost !== 0) {
    throw new Error("The authored action has not reached Initiative completion.");
  }
}

export function getReactionCommitment(
  reactionType: EncounterReactionType,
  defendingWeaponInitiativeCost?: number | null,
): number {
  if (reactionType === "dodge") return getDodgeInitiativeCost();
  if (reactionType === "tackle") return 3;
  if (reactionType === "block" || reactionType === "parry") {
    return positive(defendingWeaponInitiativeCost ?? 0, "Defending Weapon Initiative Cost");
  }
  if (reactionType === "intervention") {
    return positive(defendingWeaponInitiativeCost ?? 0, "Intervention Initiative Cost");
  }
  throw new Error("No Reaction does not create an Initiative commitment.");
}

export function reconcileReaction(input: {
  reactionType: Exclude<EncounterReactionType, "no-reaction">;
  committedInitiativeCost: number;
  attackerInitiativeCost: number;
  succeeded: boolean;
}): ReactionResolution {
  const committed = positive(input.committedInitiativeCost, "Committed Reaction Initiative Cost");
  positive(input.attackerInitiativeCost, "Attacker Initiative Cost");
  if (input.reactionType === "dodge") {
    if (committed !== getDodgeInitiativeCost()) throw new Error("Dodge must commit exactly 1 Initiative.");
    return {
      defenderFinalCost: committed,
      defenderRefund: 0,
      attackerAdditionalCost: 0,
      attackPrevented: input.succeeded,
    };
  }
  if (input.reactionType === "tackle" || input.reactionType === "intervention") {
    return {
      defenderFinalCost: committed,
      defenderRefund: 0,
      attackerAdditionalCost: 0,
      attackPrevented: false,
    };
  }
  const costs = resolveBlockParryInitiativeCosts(
    input.attackerInitiativeCost,
    committed,
    input.succeeded,
  );
  return {
    defenderFinalCost: costs.defenderCost,
    defenderRefund: committed - costs.defenderCost,
    attackerAdditionalCost: costs.attackerCost - input.attackerInitiativeCost,
    attackPrevented: input.succeeded,
  };
}

export function parseDurablePayload<T>(payloadJson: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new Error("The authored action request is corrupt.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The authored action request is invalid.");
  }
  return parsed as T;
}
