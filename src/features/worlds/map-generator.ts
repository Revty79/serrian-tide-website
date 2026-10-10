import { generationSpecSchema, type GenerationSpec } from "./generation-spec";
import { generateMap as original } from "./map-generator-v1";
import { generateMap as natural } from "./map-generator-v2";

export type { GenerationResult } from "./map-generator-v1";

// A recipe's algorithm is permanent. Never silently reroute an old seed to a new generator.
export function generateMap(input: GenerationSpec, makeId: () => string = () => crypto.randomUUID()) {
  const spec = generationSpecSchema.parse(input);
  return spec.algorithm === "serrian-atlas-v1" ? original(spec, makeId) : natural(spec, makeId);
}
