import { createHash } from "node:crypto";
import manifest from "../../../data/canon/catalog-classification-manifest.json";

export const ACTIVATED_CATALOGS = ["race", "creature", "skill", "derivedAbility"] as const;
export type ActivatedCatalog = typeof ACTIVATED_CATALOGS[number];
export type CanonIdentity = { name: string; sourceSystem: string; externalId: string };
export const canonManifest: Record<ActivatedCatalog, readonly CanonIdentity[]> = {
  race: manifest.race, creature: manifest.creature, skill: manifest.skill, derivedAbility: manifest.derivedAbility,
};
export const CANON_MANIFEST_HASH = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");

for (const catalog of ACTIVATED_CATALOGS) {
  const identities = canonManifest[catalog].map((row) => JSON.stringify([row.sourceSystem, row.externalId]));
  if (new Set(identities).size !== identities.length) throw new Error(`Duplicate ${catalog} identity in canon manifest.`);
}
