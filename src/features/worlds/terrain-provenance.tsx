import {generationPresets,type TerrainSource} from "./terrain-source";

function Source({source}:{source:TerrainSource}){
 if(source.kind==="legacy")return <p>This map predates recorded generation and import recipes. Its accepted numerical terrain remains authoritative.</p>;
 if(source.kind==="blank")return <p>Started as blank {source.surface}.</p>;
 if(source.kind==="manual")return <p>The latest accepted revision contains manual terrain or sea-level edits.</p>;
 if(source.kind==="imported")return <><p>Imported {source.fileName}, a {source.bitDepth}-bit grayscale PNG with {source.sourceWidth} by {source.sourceHeight} source samples.</p><p>Black: {source.interpretation.low} m; white: {source.interpretation.high} m. {source.interpretation.resampling} resampling; {source.interpretation.crop==="crop"?"center crop":"complete source fitted"}. Missing samples: {source.interpretation.noDataMode==="fill"?`explicit fill at ${source.interpretation.fillElevation} m`:"rejected"}. Whole-metre numerical elevations are saved, independently of the source file.</p></>;
 const r=source.recipe;
 return <><p>{generationPresets[r.preset]} · seed: <strong>{r.seed}</strong>. Generator {r.version}.</p><p>Land {r.landCoverage}%; major masses {r.landmasses}; mountains {r.mountains}; ruggedness {r.ruggedness}; coastline {r.coastline}; elevation variation {r.elevationVariation}. Island size {r.islandSize}; spacing {r.islandSpacing}; distribution {r.islandDistribution}.</p>{source.kind==="regenerated"&&<p>Accepted rectangle: column {source.area.x}, row {source.area.y}, {source.area.width} by {source.area.height} samples. Manual edits {source.preserveManual?"protected":"explicitly eligible for replacement"}; interior edge blend {source.feather} samples.</p>}</>;
}
export function TerrainProvenance({origin,current}:{origin?:TerrainSource;current?:TerrainSource}){
 return <details><summary>Terrain origin and accepted recipe</summary><Source source={origin??{kind:"legacy"}}/>{current&&current.kind!==origin?.kind&&<><h4>Latest accepted change</h4><Source source={current}/></>}{current?.kind==="regenerated"&&origin?.kind==="regenerated"&&<Source source={current}/>}<p>Accepted numerical tiles are the saved terrain. Opening a map never runs its recipe again. Earlier revisions remain retained.</p></details>;
}
