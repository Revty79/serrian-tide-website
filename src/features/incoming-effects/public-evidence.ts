import { incomingObject, storedIncomingResolution } from "./effect-proposal";

/** Explicit whitelist: never serialize private target rules, notes, ownership,
 * modifier sources or the original target snapshot into a Player response. */
export function playerIncomingAuthoredValue(value: unknown, ownsSource = true) {
  const rest = { ...incomingObject(value) };
  for (const key of ["incomingEffectResolution", "incomingRecalculation", "incomingOriginalApplication", "incomingOriginalEffect"]) delete rest[key];
  if (!ownsSource) delete rest.source;
  const resolution = storedIncomingResolution(value);
  if (!resolution) return ownsSource || !("source" in incomingObject(value)) ? value : rest;
  return { ...rest, incomingEffectSummary: { status: resolution.status,
    damage: resolution.finalEffect?.damage ?? null, healing: resolution.finalEffect?.healing ?? null,
    message: resolution.status === "requires-god-ruling" ? "Target interactions require a G.O.D. ruling."
      : resolution.status === "prevented" ? "The target's interactions prevented this effect."
      : resolution.status === "absorbed" ? "The target absorbed the incoming effect as healing."
      : "The target's protection and interactions were included in this result." } };
}

/** Location and amount are public outcomes; private ruling notes are not. */
export function playerIncomingFinalValue(value: unknown) {
  const final = incomingObject(value), application = incomingObject(final.application), ordinary = incomingObject(application.ordinaryAttack);
  if (!("ruling" in ordinary)) return value;
  const publicOrdinary = { ...ordinary }; delete publicOrdinary.ruling;
  return { ...final, application: { ...application, ordinaryAttack: publicOrdinary } };
}
