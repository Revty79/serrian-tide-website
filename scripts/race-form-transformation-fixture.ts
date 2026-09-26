import { emptyRaceFormTransformation, type RaceFormTransformation } from "../src/features/races/race-form-transformation";

/** Disposable fixture, not a canon default. */
export function transformationFixture(): RaceFormTransformation {
  return { ...emptyRaceFormTransformation(), entryMethod: "either", entryNotes: "Deliberate concentration or moonrise",
    entryTiming: { mode: "initiative", initiativeCost: 4, time: "One minute outside combat", notes: "Entry timing ruling" },
    entryCosts: { mode: "costs", costs: [
      { costType: "mana", amount: 3, resourceKey: null, notes: "Entry Mana", sortOrder: 0 },
      { costType: "health", amount: 2, resourceKey: null, notes: "Entry HP", sortOrder: 1 },
      { costType: "resource", amount: 1, resourceKey: "Quintessence", notes: "Authored resource only", sortOrder: 2 },
    ] },
    requirements: [{ conditionType: "state", conditionKey: "state.hp-percent", operator: "lte", numericValue: 50, textValue: null, notes: "Below half HP", sortOrder: 0 }, { conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "Nighttime with voluntary concentration", sortOrder: 1 }],
    involuntaryTriggers: [{ conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "Full moon and extreme stress", sortOrder: 0 }],
    duration: { mode: "fixed", description: "Ten minutes" }, exitMethods: ["voluntary", "duration-end", "resource-depletion"], exitNotes: "Return when the authored duration ends",
    exitTiming: { mode: "time", initiativeCost: null, time: "Thirty seconds", notes: "Independent exit timing" }, exitCosts: { mode: "none", costs: [] },
    limitMode: "limited", useLimits: [{ maximumUses: 2, refreshScope: "scene", refreshKey: null, notes: "Two changes per scene", sortOrder: 0 }], cooldown: "Rest for one hour between changes", equipmentEntryNotes: "Equipment remains with the body", equipmentExitNotes: "Return with the same equipment", notes: "Fixture authoring only" };
}
