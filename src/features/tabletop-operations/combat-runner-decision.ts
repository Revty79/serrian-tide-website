/** User choices accepted by the coordinated combat runner. Costs and roll
 * targets are deliberately absent: the server obtains them from owned sources. */
export type CombatRunnerDecision =
  | { kind: "attack"; source: "weapon" | "creature-attack"; sourceKey: string; targetParticipantId: number }
  | { kind: "hold" | "pass" }
  | { kind: "move"; distanceFeet: number; movementMode: string; intent: string }
  | { kind: "eligibility"; allow: boolean; reason?: string }
  | { kind: "defense"; reactionType: "no-reaction" | "dodge" | "parry" | "block"; weaponKey?: string }
  | { kind: "roll"; method: "random" | "entered"; enteredTotal?: number };

export type CombatRunnerSubmission = Readonly<{
  revision: string;
  taskKey: string;
  rollRevision?: string;
  decision: CombatRunnerDecision;
}>;
