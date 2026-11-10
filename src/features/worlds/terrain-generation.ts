import {runGenerationStepsAsync} from "./terrain-generation-steps";
import type {TerrainGeometry} from "./terrain";
import {generationRecipeSchema,type GenerationRecipe} from "./terrain-source";
import {generateTerrain as generateLegacyTerrain,legacyTerrainSteps} from "./terrain-generation-v1";
import {generatePhysicalTerrain,physicalTerrainSteps} from "./terrain-generation-v2";
import {generateAuthoredTerrain,authoredTerrainSteps} from "./terrain-generation-v3";
export {regenerateArea} from "./terrain-generation-v1";
export function generateTerrain(shape:TerrainGeometry,raw:GenerationRecipe,sea:number,progress?:(p:number)=>void):{grid:Int16Array;resolvedPreset:GenerationRecipe["preset"];layoutWarnings?:string[];featureCount?:number;rangeCount?:number}{const recipe=generationRecipeSchema.parse(raw);return recipe.version==="world-heightmap-v3"?generateAuthoredTerrain(shape,recipe,sea,progress):recipe.version==="world-heightmap-v1"?generateLegacyTerrain(shape,recipe,sea,progress):generatePhysicalTerrain(shape,recipe,sea,progress);}

export async function generateTerrainAsync(shape:TerrainGeometry,raw:GenerationRecipe,sea:number,progress?:(n:number)=>void,signal?:AbortSignal){const recipe=generationRecipeSchema.parse(raw),steps=recipe.version==="world-heightmap-v3"?authoredTerrainSteps(shape,recipe,sea):recipe.version==="world-heightmap-v1"?legacyTerrainSteps(shape,recipe,sea):physicalTerrainSteps(shape,recipe,sea);return runGenerationStepsAsync(steps,progress,signal);}
