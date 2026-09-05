export type RehearsalEvidence = Readonly<{
  step: number;
  label: string;
  suites: readonly string[];
}>;

export const PASS14_DATABASE_SUITES = [
  "validate:tabletop-db",
  "validate:tabletop-runtime-db",
  "validate:tabletop-closeout-db",
  "validate:tabletop-roll-db",
  "validate:tabletop-roll-ledger-db",
  "validate:tabletop-session-closeout-db",
  "validate:tabletop-player-db",
  "validate:called-check-db",
  "validate:player-tabletop-db",
  "validate:player-combat-db",
  "validate:weapon-skill-governance-db",
  "validate:character-weapon-governance-db",
  "validate:weapon-governance-management-db",
  "validate:action-declaration-db",
  "validate:defense-intervention-db",
  "validate:action-effect-bridge-db",
  "validate:firearm-readiness-db",
  "validate:firearm-attack-db",
] as const;

export const PASS14_BROWSER_SUITES = [
  "validate:called-check-god-browser",
  "validate:player-tabletop-browser",
  "validate:weapon-governance-management-browser",
  "validate:player-combat-browser",
] as const;

export const PASS14_JOURNEY_COVERAGE: readonly RehearsalEvidence[] = [
  { step: 1, label: "Campaign exists in an isolated fixture", suites: ["validate:tabletop-db"] },
  { step: 2, label: "Player assignments are exact", suites: ["validate:player-tabletop-db", "validate:player-combat-db"] },
  { step: 3, label: "Session opens", suites: ["validate:tabletop-db"] },
  { step: 4, label: "persistent PC and NPC roster membership", suites: ["validate:tabletop-db", "validate:called-check-db"] },
  { step: 5, label: "Scene opens", suites: ["validate:tabletop-db"] },
  { step: 6, label: "single-recipient Called Check", suites: ["validate:called-check-db"] },
  { step: 7, label: "private mixed and group Called Checks", suites: ["validate:called-check-db"] },
  { step: 8, label: "website and physical responses", suites: ["validate:called-check-db", "validate:tabletop-roll-db"] },
  { step: 9, label: "append-only reroll", suites: ["validate:called-check-db", "validate:tabletop-roll-ledger-db"] },
  { step: 10, label: "Player-roll and G.O.D.-roll High Low", suites: ["validate:called-check-db"] },
  { step: 11, label: "eligible private reveal", suites: ["validate:called-check-db"] },
  { step: 12, label: "secret absence before reveal", suites: ["validate:called-check-db", "validate:player-tabletop-db"] },
  { step: 13, label: "canonical Bestiary Creature enters Encounter directly", suites: ["validate:tabletop-runtime-db"] },
  { step: 14, label: "direct Creature creates no Character state", suites: ["validate:tabletop-runtime-db"] },
  { step: 15, label: "second occurrence of same Creature", suites: ["validate:tabletop-runtime-db"] },
  { step: 16, label: "occurrence-local state remains independent", suites: ["validate:tabletop-runtime-db"] },
  { step: 17, label: "Encounter and Initiative open", suites: ["validate:tabletop-db"] },
  { step: 18, label: "Hold and Pass", suites: ["validate:tabletop-db", "validate:player-combat-db"] },
  { step: 19, label: "ordinary melee attack", suites: ["validate:action-declaration-db", "validate:player-combat-db"] },
  { step: 20, label: "No Defense", suites: ["validate:defense-intervention-db", "validate:player-combat-db"] },
  { step: 21, label: "Dodge", suites: ["validate:defense-intervention-db", "validate:player-combat-db"] },
  { step: 22, label: "Parry or Block cost and refund", suites: ["validate:defense-intervention-db"] },
  { step: 23, label: "ally defense authorization and ruling", suites: ["validate:defense-intervention-db", "validate:player-combat-db"] },
  { step: 24, label: "Tackle exact three-Initiative rule", suites: ["validate:defense-intervention-db", "validate:player-combat-db"] },
  { step: 25, label: "exact firearm draw and readiness", suites: ["validate:firearm-readiness-db"] },
  { step: 26, label: "compatible ammunition reload", suites: ["validate:firearm-readiness-db"] },
  { step: 27, label: "exact valid firing mode", suites: ["validate:firearm-readiness-db"] },
  { step: 28, label: "Aim timing", suites: ["validate:firearm-attack-db"] },
  { step: 29, label: "normal single firearm attack", suites: ["validate:firearm-attack-db", "validate:player-combat-db"] },
  { step: 30, label: "ordinary burst and automatic attack", suites: ["validate:firearm-attack-db"] },
  { step: 31, label: "Called Shot request and exact-bound attack", suites: ["validate:firearm-attack-db", "validate:player-combat-db"] },
  { step: 32, label: "independent defenses cancel bullets by successes", suites: ["validate:firearm-attack-db", "validate:defense-intervention-db"] },
  { step: 33, label: "misses and defended shots consume ammunition once", suites: ["validate:firearm-attack-db"] },
  { step: 34, label: "preview and cancelled Aim consume no ammunition", suites: ["validate:firearm-attack-db"] },
  { step: 35, label: "cycling and recoil use authored mechanics or ruling", suites: ["validate:firearm-readiness-db", "validate:firearm-attack-db"] },
  { step: 36, label: "effect plan generation", suites: ["validate:action-effect-bridge-db", "validate:firearm-attack-db"] },
  { step: 37, label: "effect review correction approval and application", suites: ["validate:action-effect-bridge-db"] },
  { step: 38, label: "Health changes only on effect application", suites: ["validate:action-effect-bridge-db"] },
  { step: 39, label: "Item action", suites: ["validate:action-effect-bridge-db", "validate:player-combat-db"] },
  { step: 40, label: "Spell and Derived Ability unresolved combat ruling", suites: ["validate:action-effect-bridge-db", "validate:player-combat-db"] },
  { step: 41, label: "long action continuation", suites: ["validate:tabletop-db", "validate:action-declaration-db"] },
  { step: 42, label: "cancellation and correction", suites: ["validate:tabletop-closeout-db", "validate:tabletop-roll-ledger-db", "validate:action-effect-bridge-db"] },
  { step: 43, label: "Encounter closeout", suites: ["validate:tabletop-closeout-db"] },
  { step: 44, label: "Scene closeout", suites: ["validate:tabletop-closeout-db"] },
  { step: 45, label: "Session closeout blocker", suites: ["validate:tabletop-session-closeout-db"] },
  { step: 46, label: "blocker resolution and Session closeout", suites: ["validate:tabletop-session-closeout-db"] },
  { step: 47, label: "frozen historical identities and audit remain readable", suites: ["validate:tabletop-session-closeout-db", "validate:tabletop-roll-ledger-db", "validate:action-effect-bridge-db"] },
];

export const PASS14_EDGE_CASE_COVERAGE = {
  percentile: [
    "automatic target at zero or below", "impossible target above 100", "entered and generated Rolls", "01", "100",
    "matching critical collision", "impossible-target double ott", "per-success quantities", "attack-defense ties",
    "multiple defenders", "ruling-required objective outcomes",
  ],
  identityAndAuthorization: [
    "wrong Player", "unassigned Character", "NPC Character", "direct Creature occurrence", "removed roster Character",
    "absent active Scene or Encounter", "stale hierarchy or action identity", "cross-Campaign request", "cross-profile mode",
    "wrong ammunition profile", "wrong Item instance", "locked governance divergence", "invalid Skill override",
  ],
  idempotencyAndConcurrency: [
    "repeat submission", "refresh after submission", "reconnect with outstanding action", "double-click mutation keys",
    "duplicate EventSource refresh", "independent Player responses", "G.O.D. ruling with open Player console",
    "late transaction rollback", "effect application retry",
  ],
  missingAuthoredData: [
    "missing weapon Skill mapping", "invalid Character override", "missing Attribute", "missing anatomy or hit location",
    "missing firearm capacity timing or readiness", "unsupported armor or ammunition interaction",
    "missing Spell combat mode", "missing Derived Ability combat mode", "unsupported narrative consequence",
  ],
} as const;
