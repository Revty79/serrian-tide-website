import type { GenerationSpec } from "./generation-spec";
import styles from "./generation.module.css";

export function GenerationPlanReview({spec}:{spec:GenerationSpec}){
  const s=spec.settings,p=spec.plan;
  const rows=[
    ["Land",`${s.mapType}; ${s.continents} main landmass(es), ${s.size}, ${s.shape}; position ${p.landPosition}; ${s.islands} islands, ${p.islandPosition}.`],
    ["Coast",`${s.ruggedness}% ruggedness on ${p.ruggedCoast}; ${p.bays} bays per continent on ${p.baySide}, depth ${p.bayDepth}${p.additionalBaySide!=="none"?`; additional ${p.additionalBaySide} bay`:""}.`],
    ["Mountains",`${s.mountains}% tendency; ${p.mountainRanges} range(s) per continent; ${p.mountainRegion}; ${p.mountainOrientation}.`],
    ["Woodlands",`${s.forest}% coverage tendency; ${p.forestRegion}.`],
    ["Water",`${s.rivers} river/stream route(s) to ${p.riverDirection} coast; ${s.lakes} inland lake group(s), ${p.lakeRegion}.`],
    ["Terrain",`${s.biome} tendency; additional ${p.extraTerrain.join(", ")||"none"}; desert ${p.desertRegion}, grassland ${p.grasslandRegion}, wetland ${p.wetlandRegion}, snow ${p.snowRegion}.`],
    ["Appearance",`${s.style}; approximate land target ${s.landCoverage}%; seed ${spec.seed}.`],
  ];
  return <section className={styles.review} aria-label="Reviewed geographic plan"><h3>Review the geographic plan</h3><p>Unspecified features start from a simple temperate continent: one river, no lakes or offshore islands, with mountains and woods. This plan shows the entire recipe before generation.</p><dl>{rows.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><details><summary>Instructions understood</summary><ul>{spec.interpretation?.understood.map((line,i)=><li key={i}>{line}</li>)}</ul></details></section>;
}
