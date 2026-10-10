import { generateMap } from "./map-generator";
import { validateDescriptionSpec } from "./description-interpreter";
import { generationSpecSchema } from "./generation-spec";

// Bundled locally; private descriptions and source never leave this application.
self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const spec = generationSpecSchema.parse(event.data);
    validateDescriptionSpec(spec);
    self.postMessage({result: generateMap(spec), spec});
  } catch (failure) {
    self.postMessage({error: failure instanceof Error ? failure.message : "Preview generation failed."});
  }
};
