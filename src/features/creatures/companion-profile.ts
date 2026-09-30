export const COMPANION_ROLES = ["companion", "mount", "familiar", "pack-working", "guard-combat", "scout-utility", "other"] as const;
export type CompanionRole = typeof COMPANION_ROLES[number];
export const ROLE_LABELS = { companion: "Companion", mount: "Mount", familiar: "Familiar", "pack-working": "Pack / Working", "guard-combat": "Guard / Combat", "scout-utility": "Scout / Utility", other: "Other" } as const;
export const CONTROL_LABELS = { "player-directed": "Player Directed", "owner-commands": "Owner Commands", "god-directed": "G.O.D. Directed" } as const;
export const COMBAT_PREFERENCE_LABELS = { "normally-joins": "Normally Joins Combat", "normally-stays-out": "Normally Stays Out", "decide-at-start": "Decide When Combat Starts" } as const;
export type CompanionControl = keyof typeof CONTROL_LABELS;
export type CompanionCombatPreference = keyof typeof COMBAT_PREFERENCE_LABELS;
export type CompanionRoleData = { role: CompanionRole; otherLabel: string; maximumRiders: number | null; mountNotes: string };
type CommandBase = { ownerCharacterId: number; creatureCharacterId: number; expectedRevision: number; requestKey: string };
export type CompanionProfileCommand = CommandBase & (
  | { operation: "notes"; relationshipNotes: string }
  | { operation: "configure"; roles: CompanionRoleData[]; controlModel: CompanionControl; combatPreference: CompanionCombatPreference;
      relationshipNotes: string; acknowledgeRoleDataClear: boolean; confirmOwnerReview: boolean }
);

export function normalizeCompanionProfileCommand(input: CompanionProfileCommand): CompanionProfileCommand {
  if (!input || ![input.ownerCharacterId, input.creatureCharacterId].every(id => Number.isSafeInteger(id) && id > 0)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || typeof input.requestKey !== "string" || !input.requestKey.trim() || input.requestKey.length > 160) throw new Error("Choose an owned persistent Creature and its current profile revision.");
  if (typeof input.relationshipNotes !== "string" || input.relationshipNotes.trim().length > 1000) throw new Error("Relationship notes may contain up to 1,000 characters.");
  const base = { ownerCharacterId: input.ownerCharacterId, creatureCharacterId: input.creatureCharacterId,
    expectedRevision: input.expectedRevision, requestKey: input.requestKey, relationshipNotes: input.relationshipNotes.trim() };
  if (input.operation === "notes") {
    const allowed = new Set(["ownerCharacterId", "creatureCharacterId", "expectedRevision", "requestKey", "operation", "relationshipNotes"]);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new Error("The notes command cannot change authoritative Companion Profile settings.");
    return { ...base, operation: "notes" };
  }
  if (input.operation !== "configure" || !Object.hasOwn(CONTROL_LABELS, input.controlModel) || !Object.hasOwn(COMBAT_PREFERENCE_LABELS, input.combatPreference)
    || !Array.isArray(input.roles) || input.roles.length > COMPANION_ROLES.length
    || typeof input.acknowledgeRoleDataClear !== "boolean" || typeof input.confirmOwnerReview !== "boolean") throw new Error("Choose recognized roles, one Control Model, and one Combat Preference.");
  const seen = new Set<CompanionRole>();
  const roles = input.roles.map(value => {
    if (!value || !COMPANION_ROLES.includes(value.role) || seen.has(value.role)) throw new Error("Use each recognized companion role at most once.");
    seen.add(value.role);
    if (typeof value.otherLabel !== "string" || typeof value.mountNotes !== "string") throw new Error("Role descriptions must be plain text.");
    const otherLabel = value.otherLabel.trim(), mountNotes = value.mountNotes.trim();
    if (otherLabel.length > 120 || (value.role === "other" ? !/[\p{L}\p{N}]/u.test(otherLabel) : otherLabel !== "")) throw new Error("Other requires a meaningful label of up to 120 characters; only Other has a custom label.");
    if (mountNotes.length > 500 || (value.role === "mount" ? !Number.isSafeInteger(value.maximumRiders) || value.maximumRiders! <= 0 || value.maximumRiders! > 2147483647 : value.maximumRiders !== null || mountNotes !== "")) throw new Error("Mount requires a positive whole rider count. Mount-only fields require the Mount role; notes may contain up to 500 characters.");
    return { role: value.role, otherLabel, maximumRiders: value.maximumRiders, mountNotes };
  }).sort((a, b) => COMPANION_ROLES.indexOf(a.role) - COMPANION_ROLES.indexOf(b.role));
  return { ...base, operation: "configure", roles, controlModel: input.controlModel, combatPreference: input.combatPreference,
    acknowledgeRoleDataClear: input.acknowledgeRoleDataClear, confirmOwnerReview: input.confirmOwnerReview };
}

export function companionRoleLabel(role: CompanionRoleData) {
  return role.role === "other" ? `Other: ${role.otherLabel}` : ROLE_LABELS[role.role];
}
