import type { GeographicLandMask } from "./geographic-land-mask";
import { MAP_WIDTH, MAP_HEIGHT } from "./atlas-coordinates";

/** Shared source-backed mask; callers supply a unique SVG ID, never source IDs. */
export function GeographicLandMaskScene({ id, mask }: { id: string; mask: GeographicLandMask }) {
  // Separate opaque white fills also preserve union in SVG rasterizers that
  // incorrectly apply clip-rule parity across multiple clipPath children.
  return <mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} data-geographic-land-mask={mask.status}>
    {mask.parts.map(part => <path key={part.key} d={part.path} transform={mask.transform} fill="white" fillRule="evenodd" />)}
  </mask>;
}
