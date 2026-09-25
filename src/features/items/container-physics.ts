/** Pure physical calculations shared by mutations, inventory reads, and previews. */
import { emptyContainerRules, normalizeContainerRules, timeRuleApplies, type BulkContent, type ContainerRules, type TimeSubject } from "./container-rules";
export const CONTAINER_CLASSIFICATIONS = ["pocket", "pouch", "backpack", "quiver", "sheath", "holster", "case", "chest", "crate", "bottle", "flask", "generic"] as const;
export type ContainerPhysicalProfile = ContainerRules & {
  classification: typeof CONTAINER_CLASSIFICATIONS[number];
  maxWeightLb: number | null;
  volumeCapacityL: number | null;
  maxItemDimensionCm: number | null;
  allowsNestedContainers: boolean;
  liquidOnly: boolean;
  allowedCategories: string[];
  allowedRecordTypes: string[];
  containedWeightBehavior: "normal" | "contents-weightless" | "fixed";
};
export const emptyContainerPhysicalProfile = (): ContainerPhysicalProfile => ({ ...emptyContainerRules(), classification: "generic", maxWeightLb: null, volumeCapacityL: null, maxItemDimensionCm: null,
  allowsNestedContainers: true, liquidOnly: false, allowedCategories: [], allowedRecordTypes: [], containedWeightBehavior: "normal" });

export function normalizePhysicalForm(value: unknown): "solid" | "liquid" | null {
  if (value === undefined || value === null) return null;
  if (value !== "solid" && value !== "liquid") throw new Error("Choose an authored physical form, or leave it unknown.");
  return value;
}

export function physicalAmount(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite number zero or greater, or blank when not authored.`);
  return value;
}
export function normalizeContainerPhysicalProfile(input: ContainerPhysicalProfile): ContainerPhysicalProfile {
  if (!CONTAINER_CLASSIFICATIONS.includes(input.classification)) throw new Error("Choose a supported container classification.");
  const profile = { ...emptyContainerPhysicalProfile(), ...input };
  if (typeof profile.allowsNestedContainers !== "boolean" || typeof profile.liquidOnly !== "boolean") throw new Error("Choose whether nesting and liquid-only storage are enabled.");
  const restrictions = (values: string[]) => {
    if (!Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error("Content restrictions must be a list of category or record type names.");
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
  };
  return { ...normalizeContainerRules(profile, profile.containedWeightBehavior), classification: input.classification, maxWeightLb: physicalAmount(input.maxWeightLb, "Contents weight capacity"),
    volumeCapacityL: physicalAmount(input.volumeCapacityL, "Internal volume capacity"), maxItemDimensionCm: physicalAmount(input.maxItemDimensionCm, "Maximum item dimension"),
    allowsNestedContainers: profile.allowsNestedContainers, liquidOnly: profile.liquidOnly, containedWeightBehavior: profile.containedWeightBehavior,
    allowedCategories: restrictions(profile.allowedCategories), allowedRecordTypes: restrictions(profile.allowedRecordTypes) };
}

/** Only explicit units are converted. Free-text units and absent weight stay unknown. */
export function weightInLb(weight: number | null, unit: string): number | null {
  const factors: Record<string, number> = { lb: 1, lbs: 1, pound: 1, pounds: 1, oz: 1 / 16, ounce: 1 / 16, ounces: 1 / 16,
    kg: 1 / 0.45359237, kilogram: 1 / 0.45359237, kilograms: 1 / 0.45359237, g: 1 / 453.59237, gram: 1 / 453.59237, grams: 1 / 453.59237,
    mg: 1 / 453592.37, milligram: 1 / 453592.37, milligrams: 1 / 453592.37 };
  const factor = factors[unit.trim().toLowerCase()];
  if (weight === null || !Number.isFinite(weight) || weight < 0 || !factor) return null;
  const result = weight * factor;
  return Number.isFinite(result) ? result : null;
}

export type PhysicalItem = { itemId: number; name: string; weightLb: number | null; volumeL: number | null; longestDimensionCm: number | null;
  physicalForm?: "solid" | "liquid" | null; category?: string; recordType?: string; isMagical?: boolean; container: ContainerPhysicalProfile | null };
export type PhysicalGraph = {
  stacks: Array<{ itemId: number; ownedQuantity: number; looseQuantity: number; allocations: Array<{ containerInstanceId: number; quantity: number }> }>;
  instances: Array<{ instanceId: number; itemId: number; containerInstanceId: number | null }>;
};
export type SpecializedLoad = { instanceId: number; ammunitionItemId: number | null; rounds: number };
export type PhysicalAttachment = { weaponInstanceId: number; magazineInstanceId: number };
export type Measurement = { known: number; unknown: string[] };
const sum = (...parts: Measurement[]): Measurement => ({ known: parts.reduce((total, part) => total + part.known, 0), unknown: [...new Set(parts.flatMap(part => part.unknown))] });
const measure = (amount: number | null | undefined, quantity: number, label: string): Measurement =>
  quantity === 0 ? { known: 0, unknown: [] } : amount === null || amount === undefined || !Number.isFinite(amount * quantity)
    ? { known: 0, unknown: [label] } : { known: amount * quantity, unknown: [] };
export type ContainerLoad = {
  instanceId: number; label: string; profile: ContainerPhysicalProfile; contentsWeight: Measurement; loadedWeight: Measurement; usedVolume: Measurement;
  remainingWeightLb: number | null; remainingVolumeL: number | null; problems: string[];
};
const exceeds = (value: number, max: number) => value - max > Math.max(1, Math.abs(max)) * 1e-10;

export function calculateContainerPhysics(graph: PhysicalGraph, definitions: PhysicalItem[], loads: SpecializedLoad[] = [], attachments: PhysicalAttachment[] = [], bulkContents: BulkContent[] = []) {
  const items = new Map(definitions.map(item => [item.itemId, item]));
  const copies = new Map(graph.instances.map(copy => [copy.instanceId, copy]));
  const containers = new Map<number, ContainerLoad>();
  const attachedIds = new Set(attachments.map(link => link.magazineInstanceId));
  const weights = new Map<number, Measurement>();
  const visiting = new Set<number>();
  const name = (id: number) => items.get(id)?.name ?? `Item ${id}`;
  function copyWeight(id: number): Measurement {
    if (visiting.has(id)) throw new Error("Circular containment and self-containment are not allowed.");
    if (weights.has(id)) return weights.get(id)!;
    const copy = copies.get(id);
    if (!copy) throw new Error("A physical inventory copy is missing. Reload inventory.");
    visiting.add(id);
    const model = items.get(copy.itemId), label = `${name(copy.itemId)} #${id}`;
    // Specialized attachments override any general location metadata. Their
    // physical load follows the firearm assembly, never a second inventory root.
    const children = graph.instances.filter(child => child.containerInstanceId === id && !attachedIds.has(child.instanceId));
    const stacks = graph.stacks.flatMap(stack => stack.allocations.filter(allocation => allocation.containerInstanceId === id).map(allocation => ({ itemId: stack.itemId, quantity: allocation.quantity })));
    const bulk = bulkContents.find(row => row.instanceId === id);
    const source = model?.container?.source;
    // A stored finite substance retains its identity across catalog edits. Matching
    // catalog definitions supply current physical data; replaced definitions do not erase it.
    const substance = bulk && source?.substance.id === bulk.substance.id && source.substance.unit === bulk.substance.unit ? source.substance : bulk?.substance;
    const contentsWeight = sum(...children.map(child => copyWeight(child.instanceId)), ...stacks.map(stack => measure(items.get(stack.itemId)?.weightLb, stack.quantity, name(stack.itemId))),
      ...(bulk ? [measure(substance?.weightLbPerUnit, bulk.quantity, `${bulk.substance.name} substance`)] : []));
    const usedVolume = sum(...children.map(child => measure(items.get(child.itemId)?.volumeL, 1, name(child.itemId))), ...stacks.map(stack => measure(items.get(stack.itemId)?.volumeL, stack.quantity, name(stack.itemId))),
      ...(bulk ? [measure(substance?.volumeLPerUnit, bulk.quantity, `${bulk.substance.name} substance`)] : []));
    const specialized = loads.filter(load => load.instanceId === id).map(load => measure(load.ammunitionItemId === null ? null : items.get(load.ammunitionItemId)?.weightLb, load.rounds,
      load.ammunitionItemId === null ? `${label} ammunition` : `${name(load.ammunitionItemId)} ammunition`));
    const attached = attachments.filter(link => link.weaponInstanceId === id).map(link => copyWeight(link.magazineInstanceId));
    const baseAssemblyWeight = sum(measure(model?.weightLb, 1, label), ...specialized, ...attached);
    const loadedWeight = model?.container?.containedWeightBehavior === "fixed" ? measure(model.container.fixedLoadedWeightLb, 1, `${label} fixed external weight`)
      : model?.container?.containedWeightBehavior === "contents-weightless" ? baseAssemblyWeight : sum(baseAssemblyWeight, contentsWeight);
    if (model?.container) {
      const profile = model.container, problems: string[] = [];
      if (bulk) {
        if (!source || source.mode !== "finite") problems.push(`${label}: stored finite substance no longer matches the source rules; draw it out to empty the container.`);
        else {
          if (source.locked && (source.substance.id !== bulk.substance.id || source.substance.unit !== bulk.substance.unit)) problems.push(`${label}: stored substance does not match the locked source.`);
          if (source.maxQuantity !== null && exceeds(bulk.quantity, source.maxQuantity)) problems.push(`${label}: substance quantity exceeds its maximum.`);
        }
      }
      const activeSubstance = bulk ? substance : source?.mode === "infinite" ? source.substance : null;
      if (activeSubstance) {
        if (profile.liquidOnly && activeSubstance.physicalForm !== "liquid") problems.push(`${label}: the stored substance is not liquid.`);
        if (profile.magicalContentRestriction === "mundane-only" && activeSubstance.isMagical) problems.push(`${label}: mundane Items and substances only.`);
        if (profile.magicalContentRestriction === "magical-only" && !activeSubstance.isMagical) problems.push(`${label}: magical Items and substances only.`);
      }
      // Restrictions apply to directly stored Items. A closed child container's
      // contents remain governed by that child's own authored storage rules.
      for (const itemId of new Set([...children.map(child => child.itemId), ...stacks.map(stack => stack.itemId)])) {
        const content = items.get(itemId);
        if (source && !source.allowsItems) problems.push(`${label}: this source does not allow ordinary Items.`);
        if (profile.magicalContentRestriction === "mundane-only" && content?.isMagical) problems.push(`${label}: mundane Items only; ${name(itemId)} is magical.`);
        if (profile.magicalContentRestriction === "magical-only" && !content?.isMagical) problems.push(`${label}: magical Items only; ${name(itemId)} is mundane.`);
        if (!profile.allowsNestedContainers && content?.container) problems.push(`${label}: nested containers are not allowed.`);
        if (profile.liquidOnly && content?.physicalForm !== "liquid") problems.push(`${label}: liquid-only storage requires ${name(itemId)} to have an authored Liquid physical form.`);
        const matches = (allowed: string[], value: string | undefined) => !allowed.length || allowed.some(entry => entry.toLowerCase() === value?.trim().toLowerCase());
        if (!matches(profile.allowedCategories, content?.category)) problems.push(`${label}: ${name(itemId)} does not match its allowed categories (${profile.allowedCategories.join(", ")}).`);
        if (!matches(profile.allowedRecordTypes, content?.recordType)) problems.push(`${label}: ${name(itemId)} does not match its allowed record types (${profile.allowedRecordTypes.join(", ")}).`);
      }
      if (profile.weightCapacityMode !== "unlimited" && profile.maxWeightLb !== null) {
        if (contentsWeight.unknown.length) problems.push(`${label}: physical weight data not authored or unit unrecognized for ${contentsWeight.unknown.join(", ")}.`);
        else if (exceeds(contentsWeight.known, profile.maxWeightLb)) problems.push(`${label}: contents weigh ${formatPhysical(contentsWeight.known)} lb; weight capacity is ${formatPhysical(profile.maxWeightLb)} lb.`);
      }
      if (profile.volumeCapacityMode !== "unlimited" && profile.volumeCapacityL !== null) {
        if (usedVolume.unknown.length) problems.push(`${label}: physical volume data not authored for ${usedVolume.unknown.join(", ")}.`);
        else if (exceeds(usedVolume.known, profile.volumeCapacityL)) problems.push(`${label}: contents use ${formatPhysical(usedVolume.known)} L; volume capacity is ${formatPhysical(profile.volumeCapacityL)} L.`);
      }
      if (profile.maxItemDimensionCm !== null) for (const itemId of new Set([...children.map(child => child.itemId), ...stacks.map(stack => stack.itemId)])) {
        const dimension = items.get(itemId)?.longestDimensionCm;
        if (dimension === null || dimension === undefined) problems.push(`${label}: physical dimension data not authored for ${name(itemId)}.`);
        else if (exceeds(dimension, profile.maxItemDimensionCm)) problems.push(`${name(itemId)} is too long to fit in ${label}: ${formatPhysical(dimension)} cm exceeds its ${formatPhysical(profile.maxItemDimensionCm)} cm maximum item dimension.`);
      }
      containers.set(id, { instanceId: id, label, profile, contentsWeight, loadedWeight, usedVolume, problems,
        remainingWeightLb: profile.weightCapacityMode === "unlimited" || profile.maxWeightLb === null || contentsWeight.unknown.length ? null : profile.maxWeightLb - contentsWeight.known,
        remainingVolumeL: profile.volumeCapacityMode === "unlimited" || profile.volumeCapacityL === null || usedVolume.unknown.length ? null : profile.volumeCapacityL - usedVolume.known });
    }
    visiting.delete(id); weights.set(id, loadedWeight); return loadedWeight;
  }
  for (const copy of graph.instances) copyWeight(copy.instanceId);
  // Ownership remains authoritative. Each root contributes once, with its entire load.
  const carriedWeight = sum(...graph.instances.filter(copy => copy.containerInstanceId === null && !attachedIds.has(copy.instanceId)).map(copy => copyWeight(copy.instanceId)),
    ...graph.stacks.map(stack => measure(items.get(stack.itemId)?.weightLb, stack.looseQuantity, name(stack.itemId))));
  return { containers: [...containers.values()], carriedWeight };
}

/** Elapsed units are preserved. Pass the immediate container for a stack, substance,
 * or future living subject; exact copies use their parent (not their own rule).
 * Applicable suspension wins, otherwise ancestor multipliers multiply. */
export function resolveContainedElapsedTime(graph: PhysicalGraph, definitions: PhysicalItem[], containerInstanceId: number | null, elapsed: number, subject: TimeSubject) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("Elapsed time must be finite and zero or greater.");
  const seen = new Set<number>(), applied: Array<{ instanceId: number; multiplier: number }> = [];
  let next = containerInstanceId;
  while (next !== null) {
    if (seen.has(next)) throw new Error("Circular containment is not allowed.");
    seen.add(next);
    const copy = graph.instances.find(row => row.instanceId === next);
    const rule = definitions.find(row => row.itemId === copy?.itemId)?.container;
    if (!copy || !rule) throw new Error("Contained time requires an existing container ancestor.");
    if (timeRuleApplies(rule, subject)) applied.push({ instanceId: next, multiplier: rule.timeBehavior === "suspended" ? 0 : rule.timeBehavior === "normal" ? 1 : rule.timeMultiplier! });
    next = copy.containerInstanceId;
  }
  const multiplier = applied.some(row => row.multiplier === 0) ? 0 : applied.reduce((total, row) => total * row.multiplier, 1);
  if (!Number.isFinite(multiplier) || !Number.isFinite(elapsed * multiplier)) throw new Error("Combined contained time exceeds the supported finite range.");
  return { elapsed: elapsed * multiplier, multiplier, applied };
}

export function formatPhysical(value: number): string { return Number(value.toFixed(3)).toLocaleString("en-US"); }
export function displayMeasurement(value: Measurement, unit: string): string {
  return value.unknown.length ? `Physical data not authored (${formatPhysical(value.known)} ${unit} known)` : `${formatPhysical(value.known)} ${unit}`;
}
