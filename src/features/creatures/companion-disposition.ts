export const COMPANION_DISPOSITIONS = ["accompanying", "vessel-bound", "away"] as const;
export type CompanionDisposition = (typeof COMPANION_DISPOSITIONS)[number];
export const COMPANION_DISPOSITION_LABELS = { accompanying: "Accompanying", "vessel-bound": "Vessel-bound", away: "Away" } as const;
export type CompanionDispositionCommand = {
  ownerCharacterId: number;
  creatureCharacterId: number;
  disposition: CompanionDisposition;
  awayNote: string;
  vesselInstanceId: number | null;
  expectedRevision: number;
  acknowledgeUnbind: boolean;
  requestKey: string;
};

export function normalizeCompanionDispositionCommand(input: CompanionDispositionCommand): CompanionDispositionCommand {
  if (![input.ownerCharacterId, input.creatureCharacterId].every(id => Number.isSafeInteger(id) && id > 0)
    || !COMPANION_DISPOSITIONS.includes(input.disposition)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || typeof input.awayNote !== "string" || input.awayNote.trim().length > 240
    || typeof input.acknowledgeUnbind !== "boolean"
    || typeof input.requestKey !== "string" || !input.requestKey.trim() || input.requestKey.length > 160) {
    throw new Error("Choose a saved owned Creature, a travel disposition, and current revision. Away notes may contain up to 240 characters.");
  }
  if (input.disposition === "vessel-bound" ? !Number.isSafeInteger(input.vesselInstanceId) || input.vesselInstanceId! <= 0 : input.vesselInstanceId !== null) {
    throw new Error("Vessel-bound requires one exact Creature Vessel copy. Other dispositions have no Vessel binding.");
  }
  if (input.disposition !== "away" && input.awayNote.trim()) throw new Error("A location note applies only to Away.");
  return { ownerCharacterId: input.ownerCharacterId, creatureCharacterId: input.creatureCharacterId,
    disposition: input.disposition, awayNote: input.awayNote.trim(), vesselInstanceId: input.vesselInstanceId,
    expectedRevision: input.expectedRevision, acknowledgeUnbind: input.acknowledgeUnbind, requestKey: input.requestKey };
}

export function vesselCopyLabel(name: string, instanceId: number) {
  return `${name} · Copy ${instanceId.toString(36).toUpperCase().padStart(4, "0")}`;
}
