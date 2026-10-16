import { useMemo, type ComponentProps } from "react";
import type { GeographicViewport, SourceGeometry } from "./geographic";
import { projectedSourcePath } from "./geographic-projection";
import { geographicLandMask } from "./geographic-land-mask";
import { GeographicScene, type GeographicImage } from "./geographic-scene";
import { CartographyScene } from "./cartography-scene";
import styles from "./cartography.module.css";

export type GeographicCompositionPreview = { replaceSource: string | null; geometry: SourceGeometry | null; generation: SourceGeometry | null };

/** One authorized view supplies the land fill and artwork mask in every Atlas composition. */
export function AtlasMapScene({ viewport, ready, elevation, landCover, labelsVisible, themes, canvasWidth, onChoose, boundedKeyboard, preview, artworkVisible = true, ...artwork }: ComponentProps<typeof CartographyScene> & {
  viewport: GeographicViewport | null; ready: boolean; elevation: GeographicImage; landCover: GeographicImage;
  labelsVisible?: boolean; themes?: string[]; canvasWidth?: number; onChoose?: (id: string) => void; boundedKeyboard?: boolean;
  preview?: GeographicCompositionPreview; artworkVisible?: boolean;
}) {
  const frame = artwork.geographicFrame;
  const view = useMemo(() => {
    if (!viewport || !frame || !preview) return viewport;
    const shapes = viewport.shapes.filter(s => s.id !== preview.replaceSource);
    for (const [index, geometry] of [preview.geometry, preview.generation].entries()) {
      if (!geometry) continue;
      shapes.push({ id: `draft-${index}`, versionId: "transient", geographyId: "", name: "", semantic: "authored-geography", revision: 0, part: 0, geometryType: geometry.type, sourceBounds: viewport.bounds, style: geometry.type === "LineString" ? "river" : "land", path: projectedSourcePath(geometry, frame.reference, frame.bounds, frame.kind) });
    }
    return { ...viewport, shapes };
  }, [viewport, frame, preview]);
  const mask = useMemo(() => frame ? geographicLandMask(view, ready) : undefined, [frame, view, ready]);
  const presentation = artwork.draft.presentation;
  const islandStyle = presentation?.version === 2 ? `${presentation.styleRef.id}:${presentation.styleRef.revision}` : undefined;
  // Only an explicitly authored fictional reference asserts an artistic sea.
  // Scientific NoData stays neutral; no absence of elevation is interpreted as water.
  const fictional = frame?.reference.crs.startsWith("AUTHORED:");
  return <g className={styles.scene} data-style={presentation?.style ?? "parchment"} data-cartographic-style={islandStyle} data-atlas-composition>
    {frame && <rect width={2000} height={1200} className={fictional ? styles.sea : styles.settlementPaper} data-map-background={fictional ? "fictional-water" : "unknown-coverage"} pointerEvents="none" />}
    {view && frame && <g transform="scale(2)"><GeographicScene viewport={view} elevation={elevation} landCover={landCover} flipY={frame.reference.kind === "plane"} labelsVisible={labelsVisible} themes={themes} canvasWidth={canvasWidth} onChoose={onChoose} boundedKeyboard={boundedKeyboard} /></g>}
    {artworkVisible && <CartographyScene {...artwork} background={!frame} landMask={mask} />}
  </g>;
}
