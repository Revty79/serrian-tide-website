import {defaultGeneration,type GenerationRecipeV3} from "./terrain-source";
import {interpretDescription} from "./terrain-description";
import type {IntentPlan} from "./terrain-intent";
export function describedRecipe(description:string,space:IntentPlan["space"],area:IntentPlan["area"],seed=defaultGeneration.seed):GenerationRecipeV3{
 const interpretation=interpretDescription(description,space,area),local=Math.max(area.width,area.height)<=100000;
 return {...defaultGeneration,version:"world-heightmap-v3",preset:"continents",geographicScale:"custom",seed:interpretation.seed??seed,oceanDepthM:local?1000:4500,description,plan:interpretation.plan,interpretationIssues:interpretation.issues,interpretationNotes:interpretation.notes,planConfirmed:false};
}
