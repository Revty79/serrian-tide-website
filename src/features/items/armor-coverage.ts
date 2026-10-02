import { CHARACTER_HUMANOID_HIT_LOCATIONS } from "@/features/characters/character-rules";

export const ARMOR_BODY_LOCATION_CHOICES = [
  { key: "head", label: "Head", locationKeys: ["0"] },
  { key: "right-arm", label: "Right Arm", locationKeys: ["1"] },
  { key: "left-arm", label: "Left Arm", locationKeys: ["2"] },
  { key: "right-leg", label: "Right Leg", locationKeys: ["3", "4"] },
  { key: "left-leg", label: "Left Leg", locationKeys: ["5", "6"] },
  { key: "groin", label: "Groin", locationKeys: ["7"] },
  { key: "stomach", label: "Stomach", locationKeys: ["8"] },
  { key: "chest", label: "Chest", locationKeys: ["9"] },
] as const;

export const STANDARD_ARMOR_LOCATIONS = CHARACTER_HUMANOID_HIT_LOCATIONS.map(({ result, name }) => ({ key: String(result), label: name }));
export type ArmorLocationReference = { key: string; label: string };
const CUSTOM_PREFIX = "custom:";
const cleanName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ");
const nameKey = (name: string) => cleanName(name).toLocaleLowerCase("en-US");

export function otherArmorLocationKeys(name: string): string[] {
  const label = cleanName(name);
  if (!label) throw new Error("Enter the body location name before adding it.");
  if (label.length > 80 || /[\u0000-\u001f\u007f]/u.test(label)) throw new Error("Body location names must be readable text of 80 characters or fewer.");
  const general = ARMOR_BODY_LOCATION_CHOICES.find((entry) => nameKey(entry.label) === nameKey(label));
  if (general) return [...general.locationKeys];
  const standard = STANDARD_ARMOR_LOCATIONS.find((entry) => nameKey(entry.label) === nameKey(label));
  return standard ? [standard.key] : [CUSTOM_PREFIX + label];
}

export function armorLocationDefinition(key: string): ArmorLocationReference | null {
  const standard = STANDARD_ARMOR_LOCATIONS.find((entry) => entry.key === key);
  if (standard) return standard;
  if (!key.startsWith(CUSTOM_PREFIX)) return null;
  const label = cleanName(key.slice(CUSTOM_PREFIX.length));
  otherArmorLocationKeys(label); // Apply the same name validation on the server.
  return { key: CUSTOM_PREFIX + nameKey(label), label };
}

export function normalizeArmorCoverageKeys(keys: readonly string[]): string[] {
  if (!Array.isArray(keys) || keys.length > 100) throw new Error("Choose no more than 100 covered body locations.");
  const unique = new Map<string, string>();
  for (const value of keys) {
    if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error("Choose a valid covered body location.");
    const key = value.trim();
    const expanded = key.startsWith(CUSTOM_PREFIX) ? otherArmorLocationKeys(key.slice(CUSTOM_PREFIX.length)) : [key];
    for (const entry of expanded) {
      const identity = armorLocationDefinition(entry)?.key ?? entry;
      if (!unique.has(identity)) unique.set(identity, entry);
    }
  }
  return [...unique.values()];
}

export function armorCoverageDraftKey(key: string, label?: string | null): string {
  return key.startsWith(CUSTOM_PREFIX) && label ? CUSTOM_PREFIX + label : key;
}

export function armorLocationLabel(key: string, references: readonly ArmorLocationReference[] = []): string {
  return references.find((entry) => entry.key === key)?.label
    ?? armorLocationDefinition(key)?.label ?? key;
}

export function armorCoverageEntries(keys: readonly string[], references: readonly ArmorLocationReference[] = []) {
  const remaining = new Set(keys);
  const entries: Array<{ label: string; keys: string[] }> = [];
  for (const choice of ARMOR_BODY_LOCATION_CHOICES) {
    if (!choice.locationKeys.every((key) => remaining.has(key))) continue;
    entries.push({ label: choice.label, keys: [...choice.locationKeys] });
    for (const key of choice.locationKeys) remaining.delete(key);
  }
  for (const key of remaining) entries.push({ label: armorLocationLabel(key, references), keys: [key] });
  return entries;
}

/** Existing numbered coverage keeps its meaning; named coverage matches the target's actual anatomy. */
export function armorCoversLocation(keys: readonly string[], location: { key: string; name: string } | undefined): boolean {
  if (!location) return false;
  return keys.includes(location.key) || keys.some((key) => key.startsWith(CUSTOM_PREFIX) && nameKey(key.slice(CUSTOM_PREFIX.length)) === nameKey(location.name));
}
