import type {TerrainGeometry} from "./terrain";
import type {TerrainSource} from "./terrain-source";
import {assessGeographicScale,validatePhysicalHeights} from "./terrain-scale";
/** Shared admission rules. They never resize a feature or regenerate heights. */
export function validateGenerationAcceptance(shape:TerrainGeometry,source:TerrainSource,sea:number){
 if((source.kind!=="generated"&&source.kind!=="regenerated")||source.recipe.version!=="world-heightmap-v2")return;
 validatePhysicalHeights(shape,source.recipe,sea);
 if(assessGeographicScale(shape,source.recipe).requiresAcknowledgement&&source.scaleAcknowledged!==true)throw Error("Read and acknowledge the physical-scale representation limits before accepting this proposal. No terrain was accepted.");
}
