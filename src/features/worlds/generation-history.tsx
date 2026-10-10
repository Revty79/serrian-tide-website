import type { GenerationProvenance } from "./generation-spec";
import styles from "./generation.module.css";
export function GenerationHistory({value}:{value:GenerationProvenance|null|undefined}) {
  if(!value)return null;
  return <details className={styles.recipe}><summary>Creation recipe</summary><p>{value.kind==="duplicate"?"Copied from another map in this World. Geography links remain shared; drawing identities are independent.":"Created from a generated preview. The saved geography is now independent of the generator."}</p>{value.sourceMapId&&<p>Source map: {value.sourceMapId} · saved revision {value.sourceRevision}</p>}{value.spec&&<><p>Seed: {value.spec.seed}<br/>Generator version: {value.spec.algorithm}</p><p>{value.spec.settings.continents} continents, {value.spec.settings.islands} islands, {value.spec.settings.biome} terrain</p>{value.spec.description&&<p>Original description: {value.spec.description}</p>}</>}<p>Manual edits change the saved shapes and artwork. They do not rewrite this creation record.</p></details>;
}
