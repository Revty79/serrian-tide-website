/** Pure physical calculations shared by mutations, inventory reads, and previews. */
export const CONTAINER_CLASSIFICATIONS = ["pocket", "pouch", "backpack", "quiver", "sheath", "holster", "case", "chest", "crate", "bottle", "flask", "generic"] as const;
export type ContainerPhysicalProfile = {
  classification: typeof CONTAINER_CLASSIFICATIONS[number];
  maxWeightLb: number | null;
  volumeCapacityL: number | null;
  maxItemDimensionCm: number | null;
  allowsNestedContainers: boolean;
  liquidOnly: boolean;
  allowedCategories: string[];
  allowedRecordTypes: string[];
  containedWeightBehavior: "normal";
};
export const emptyContainerPhysicalProfile = (): ContainerPhysicalProfile => ({ classification: "generic", maxWeightLb: null, volumeCapacityL: null, maxItemDimensionCm: null,
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
  if (profile.containedWeightBehavior !== "normal") throw new Error("Only normal contained weight is supported.");
  const restrictions = (values: string[]) => {
    if (!Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error("Content restrictions must be a list of category or record type names.");
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
  };
  return { classification: input.classification, maxWeightLb: physicalAmount(input.maxWeightLb, "Contents weight capacity"),
    volumeCapacityL: physicalAmount(input.volumeCapacityL, "Internal volume capacity"), maxItemDimensionCm: physicalAmount(input.maxItemDimensionCm, "Maximum item dimension"),
    allowsNestedContainers: profile.allowsNestedContainers, liquidOnly: profile.liquidOnly, containedWeightBehavior: "normal",
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
  physicalForm?: "solid" | "liquid" | null; category?: string; recordType?: string; container: ContainerPhysicalProfile | null };
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

export function calculateContainerPhysics(graph: PhysicalGraph, definitions: PhysicalItem[], loads: SpecializedLoad[] = [], attachments: PhysicalAttachment[] = []) {
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
    const contentsWeight = sum(...children.map(child => copyWeight(child.instanceId)), ...stacks.map(stack => measure(items.get(stack.itemId)?.weightLb, stack.quantity, name(stack.itemId))));
    const usedVolume = sum(...children.map(child => measure(items.get(child.itemId)?.volumeL, 1, name(child.itemId))), ...stacks.map(stack => measure(items.get(stack.itemId)?.volumeL, stack.quantity, name(stack.itemId))));
    const specialized = loads.filter(load => load.instanceId === id).map(load => measure(load.ammunitionItemId === null ? null : items.get(load.ammunitionItemId)?.weightLb, load.rounds,
      load.ammunitionItemId === null ? `${label} ammunition` : `${name(load.ammunitionItemId)} ammunition`));
    const attached = attachments.filter(link => link.weaponInstanceId === id).map(link => copyWeight(link.magazineInstanceId));
    const loadedWeight = sum(measure(model?.weightLb, 1, label), contentsWeight, ...specialized, ...attached);
    if (model?.container) {
      const profile = model.container, problems: string[] = [];
      // Restrictions apply to directly stored Items. A closed child container's
      // contents remain governed by that child's own authored storage rules.
      for (const itemId of new Set([...children.map(child => child.itemId), ...stacks.map(stack => stack.itemId)])) {
        const content = items.get(itemId);
        if (!profile.allowsNestedContainers && content?.container) problems.push(`${label}: nested containers are not allowed.`);
        if (profile.liquidOnly && content?.physicalForm !== "liquid") problems.push(`${label}: liquid-only storage requires ${name(itemId)} to have an authored Liquid physical form.`);
        const matches = (allowed: string[], value: string | undefined) => !allowed.length || allowed.some(entry => entry.toLowerCase() === value?.trim().toLowerCase());
        if (!matches(profile.allowedCategories, content?.category)) problems.push(`${label}: ${name(itemId)} does not match its allowed categories (${profile.allowedCategories.join(", ")}).`);
        if (!matches(profile.allowedRecordTypes, content?.recordType)) problems.push(`${label}: ${name(itemId)} does not match its allowed record types (${profile.allowedRecordTypes.join(", ")}).`);
      }
      if (profile.maxWeightLb !== null) {
        if (contentsWeight.unknown.length) problems.push(`${label}: physical weight data not authored or unit unrecognized for ${contentsWeight.unknown.join(", ")}.`);
        else if (exceeds(contentsWeight.known, profile.maxWeightLb)) problems.push(`${label}: contents weigh ${formatPhysical(contentsWeight.known)} lb; weight capacity is ${formatPhysical(profile.maxWeightLb)} lb.`);
      }
      if (profile.volumeCapacityL !== null) {
        if (usedVolume.unknown.length) problems.push(`${label}: physical volume data not authored for ${usedVolume.unknown.join(", ")}.`);
        else if (exceeds(usedVolume.known, profile.volumeCapacityL)) problems.push(`${label}: contents use ${formatPhysical(usedVolume.known)} L; volume capacity is ${formatPhysical(profile.volumeCapacityL)} L.`);
      }
      if (profile.maxItemDimensionCm !== null) for (const itemId of new Set([...children.map(child => child.itemId), ...stacks.map(stack => stack.itemId)])) {
        const dimension = items.get(itemId)?.longestDimensionCm;
        if (dimension === null || dimension === undefined) problems.push(`${label}: physical dimension data not authored for ${name(itemId)}.`);
        else if (exceeds(dimension, profile.maxItemDimensionCm)) problems.push(`${name(itemId)} is too long to fit in ${label}: ${formatPhysical(dimension)} cm exceeds its ${formatPhysical(profile.maxItemDimensionCm)} cm maximum item dimension.`);
      }
      containers.set(id, { instanceId: id, label, profile, contentsWeight, loadedWeight, usedVolume, problems,
        remainingWeightLb: profile.maxWeightLb === null || contentsWeight.unknown.length ? null : profile.maxWeightLb - contentsWeight.known,
        remainingVolumeL: profile.volumeCapacityL === null || usedVolume.unknown.length ? null : profile.volumeCapacityL - usedVolume.known });
    }
    visiting.delete(id); weights.set(id, loadedWeight); return loadedWeight;
  }
  for (const copy of graph.instances) copyWeight(copy.instanceId);
  // Ownership remains authoritative. Each root contributes once, with its entire load.
  const carriedWeight = sum(...graph.instances.filter(copy => copy.containerInstanceId === null && !attachedIds.has(copy.instanceId)).map(copy => copyWeight(copy.instanceId)),
    ...graph.stacks.map(stack => measure(items.get(stack.itemId)?.weightLb, stack.looseQuantity, name(stack.itemId))));
  return { containers: [...containers.values()], carriedWeight };
}

export function formatPhysical(value: number): string { return Number(value.toFixed(3)).toLocaleString("en-US"); }
export function displayMeasurement(value: Measurement, unit: string): string {
  return value.unknown.length ? `Physical data not authored (${formatPhysical(value.known)} ${unit} known)` : `${formatPhysical(value.known)} ${unit}`;
}
