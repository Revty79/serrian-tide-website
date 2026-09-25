/** Authored rules, shared by the catalog editor, server, and physical calculator. */
export type Substance = {
  id: string; name: string; unit: "L" | "kg" | "lb";
  weightLbPerUnit: number | null; volumeLPerUnit: number | null;
  physicalForm: "solid" | "liquid"; isMagical: boolean;
};
export type ContainerSource = {
  mode: "finite" | "infinite"; substance: Substance; maxQuantity: number | null;
  locked: boolean; allowsItems: boolean;
};
export type ContainerRules = {
  closureMode: "always-accessible" | "open-close";
  retrieveInitiativeCost: number | null;
  stowInitiativeCost: number | null;
  openInitiativeCost: number | null;
  closeInitiativeCost: number | null;
  weightCapacityMode: "normal" | "unlimited";
  volumeCapacityMode: "normal" | "unlimited";
  fixedLoadedWeightLb: number | null;
  magicalContentRestriction: "any" | "mundane-only" | "magical-only";
  timeBehavior: "normal" | "suspended" | "slowed" | "accelerated";
  timeMultiplier: number | null;
  timeAppliesTo: "all" | "perishables" | "living" | "categories-types";
  timeCategories: string[]; timeRecordTypes: string[];
  livingContentsAllowed: boolean;
  source: ContainerSource | null;
};
export const emptyContainerRules = (): ContainerRules => ({
  closureMode: "always-accessible", retrieveInitiativeCost: null, stowInitiativeCost: null, openInitiativeCost: null, closeInitiativeCost: null,
  weightCapacityMode: "normal", volumeCapacityMode: "normal", fixedLoadedWeightLb: null,
  magicalContentRestriction: "any", timeBehavior: "normal", timeMultiplier: null,
  timeAppliesTo: "all", timeCategories: [], timeRecordTypes: [], livingContentsAllowed: false, source: null,
});
export const emptyContainerSource = (): ContainerSource => ({ mode: "finite", maxQuantity: null, locked: true, allowsItems: false,
  substance: { id: "", name: "", unit: "L", weightLbPerUnit: null, volumeLPerUnit: 1, physicalForm: "liquid", isMagical: false } });

function choice<T extends string>(value: T, choices: readonly T[], label: string): T {
  if (!choices.includes(value)) throw new Error(`Choose a supported ${label}.`);
  return value;
}
export function ruleNames(values: string[]): string[] {
  if (!Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error("Choose a list of category or record type names.");
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
function amount(value: number | null, label: string): number | null {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new Error(`${label} must be finite and zero or greater.`);
  return value;
}
export function normalizeSubstance(input: Substance): Substance {
  if (!input || typeof input.id !== "string" || !input.id.trim() || typeof input.name !== "string" || !input.name.trim()) throw new Error("Define the source substance identity and name.");
  if (typeof input.isMagical !== "boolean") throw new Error("Choose the substance's magical classification.");
  return { id: input.id.trim(), name: input.name.trim(), unit: choice(input.unit, ["L", "kg", "lb"], "substance unit"),
    physicalForm: choice(input.physicalForm, ["solid", "liquid"], "substance physical form"), isMagical: input.isMagical,
    weightLbPerUnit: amount(input.weightLbPerUnit, "Substance weight per unit"), volumeLPerUnit: amount(input.volumeLPerUnit, "Substance volume per unit") };
}
export function normalizeContainerRules(input: ContainerRules, weightBehavior: string): ContainerRules {
  const defaults = emptyContainerRules();
  const rules = Object.fromEntries(Object.keys(defaults).map(key => [key, input[key as keyof ContainerRules] === undefined ? defaults[key as keyof ContainerRules] : input[key as keyof ContainerRules]])) as ContainerRules;
  choice(rules.closureMode, ["always-accessible", "open-close"], "closure mode");
  for (const key of ["retrieveInitiativeCost", "stowInitiativeCost", "openInitiativeCost", "closeInitiativeCost"] as const) rules[key] = amount(rules[key], "Container Initiative cost");
  choice(rules.weightCapacityMode, ["normal", "unlimited"], "weight capacity mode");
  choice(rules.volumeCapacityMode, ["normal", "unlimited"], "volume capacity mode");
  choice(rules.magicalContentRestriction, ["any", "mundane-only", "magical-only"], "magical content restriction");
  choice(weightBehavior, ["normal", "contents-weightless", "fixed"], "contained weight behavior");
  rules.fixedLoadedWeightLb = amount(rules.fixedLoadedWeightLb, "Fixed external weight");
  if (weightBehavior === "fixed" && rules.fixedLoadedWeightLb === null) throw new Error("Author a fixed external weight.");
  choice(rules.timeBehavior, ["normal", "suspended", "slowed", "accelerated"], "time behavior");
  choice(rules.timeAppliesTo, ["all", "perishables", "living", "categories-types"], "time applicability");
  if (rules.timeBehavior === "slowed" || rules.timeBehavior === "accelerated") {
    const ratio = rules.timeMultiplier;
    if (typeof ratio !== "number" || !Number.isFinite(ratio) || (rules.timeBehavior === "slowed" ? ratio <= 0 || ratio >= 1 : ratio <= 1)) throw new Error("Slowed time requires a multiplier between 0 and 1; accelerated time requires a finite multiplier greater than 1.");
  } else rules.timeMultiplier = null;
  rules.timeCategories = ruleNames(rules.timeCategories); rules.timeRecordTypes = ruleNames(rules.timeRecordTypes);
  if (rules.timeBehavior !== "normal" && rules.timeAppliesTo === "categories-types" && !rules.timeCategories.length && !rules.timeRecordTypes.length) throw new Error("Choose categories or record types for selective time.");
  if (typeof rules.livingContentsAllowed !== "boolean") throw new Error("Choose whether living contents are allowed.");
  if (rules.source !== null) {
    const source = rules.source;
    choice(source.mode, ["finite", "infinite"], "source mode");
    if (typeof source.locked !== "boolean" || typeof source.allowsItems !== "boolean") throw new Error("Choose the source content restrictions.");
    const max = amount(source.maxQuantity, "Maximum source quantity");
    if (source.mode === "finite" && (max === null || max <= 0)) throw new Error("A finite source requires a positive maximum quantity.");
    if (source.mode === "infinite" && weightBehavior === "normal") throw new Error("An infinite source requires contents-weightless or fixed external weight.");
    rules.source = { ...source, substance: normalizeSubstance(source.substance), maxQuantity: source.mode === "finite" ? max : null };
  }
  return rules;
}

export type BulkContent = { instanceId: number; substance: Substance; quantity: number };

/** Quantity units remain unchanged. Tolerate only floating-point roundoff at a
 * boundary, so decimal draws can empty a source without phantom residual rows. */
export function adjustSubstanceQuantity(current: number, amount: number, operation: "add" | "draw", maximum: number | null): number {
  if (!Number.isFinite(current) || current < 0 || !Number.isFinite(amount) || amount <= 0) throw new Error("Substance quantities must be finite and positive.");
  const rounding = Number.EPSILON * Math.max(current, amount) * 4;
  const next = operation === "add" ? current + amount : current - amount;
  if (next === current) throw new Error("This adjustment is too small for the stored quantity's precision.");
  if (operation === "draw") {
    if (next < -rounding) throw new Error("Not enough substance remains to draw that amount.");
    return Math.abs(next) <= rounding ? 0 : next;
  }
  if (!Number.isFinite(next) || maximum === null || !Number.isFinite(maximum) || next - maximum > Number.EPSILON * Math.max(next, maximum) * 4) throw new Error("This amount exceeds the finite source maximum quantity.");
  return Math.min(next, maximum);
}

/** Explicit traits can be supplied by future systems; names and descriptions are never classifiers. */
export type TimeSubject = { category?: string; recordType?: string; perishable?: boolean; living?: boolean };
export function timeRuleApplies(rule: ContainerRules, subject: TimeSubject): boolean {
  const matches = (values: string[], value?: string) => values.some(entry => entry.toLowerCase() === value?.trim().toLowerCase());
  switch (rule.timeAppliesTo) {
    case "all": return true;
    case "living": return subject.living === true;
    case "perishables": return subject.perishable ?? (matches(["Food", "Perishable"], subject.category) || matches(["Food", "Perishable"], subject.recordType));
    case "categories-types": return matches(rule.timeCategories, subject.category) || matches(rule.timeRecordTypes, subject.recordType);
  }
}
