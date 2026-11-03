export type WaterPendingFlags={recovered:boolean;lakePoints:number;wetlandPoints:number;running:boolean;riverSuggestions:boolean;lakeSelection:boolean;shorelinePreview:boolean;watershedPreview:boolean;featureSuggestions:number;changed:boolean;dirty:boolean;saving:boolean;retry:boolean;error?:string};
export type WaterPendingAction="recover"|"cancelLake"|"cancelWetland"|"cancelCalculation"|"cancelSuggestions"|"cancelShoreline"|"closeWatershed"|"cancelFeatures"|"save"|"export"|"discard";
/** Pure presentation data: no editor callbacks or mutable source state are evaluated here. */
export function waterPendingPlan(w:WaterPendingFlags){
 const active=w.dirty||w.changed||w.recovered||w.running||w.lakePoints||w.wetlandPoints||w.riverSuggestions||w.lakeSelection||w.shorelinePreview||w.watershedPreview||w.featureSuggestions;
 const reason=[w.recovered&&"This browser kept water changes from an earlier visit.",w.lakePoints&&`The lake outline has ${w.lakePoints} point${w.lakePoints===1?"":"s"} and is not finished.`,w.wetlandPoints&&`The wetland outline has ${w.wetlandPoints} point${w.wetlandPoints===1?"":"s"} and is not finished.`,w.running&&"A water calculation is still running.",w.riverSuggestions&&"River or lake suggestions have not been accepted or cancelled.",w.shorelinePreview&&"A calculated lake shoreline is waiting for your decision.",w.watershedPreview&&"A temporary watershed view is open.",w.featureSuggestions&&`${w.featureSuggestions} water feature suggestions are waiting for your decision.`,w.changed&&"Your water changes have not been saved.",active&&w.error&&`The last water action could not finish: ${w.error}`].filter(Boolean).join(" ");
 const actions:{id:WaterPendingAction;label:string;disabled?:boolean}[]=[];
 if(w.recovered)actions.push({id:"recover",label:"Recover water changes"});
 if(w.lakePoints)actions.push({id:"cancelLake",label:"Cancel lake outline"});
 if(w.wetlandPoints)actions.push({id:"cancelWetland",label:"Cancel wetland outline"});
 if(w.running)actions.push({id:"cancelCalculation",label:"Cancel water calculation"});
 if(w.riverSuggestions||w.lakeSelection)actions.push({id:"cancelSuggestions",label:"Cancel river / lake suggestions"});
 if(w.shorelinePreview)actions.push({id:"cancelShoreline",label:"Cancel lake shoreline preview"});
 if(w.watershedPreview)actions.push({id:"closeWatershed",label:"Close watershed preview"});
 if(w.featureSuggestions)actions.push({id:"cancelFeatures",label:"Cancel water feature suggestions"});
 actions.push({id:"save",label:w.retry?"Retry water save":"Save water changes",disabled:w.recovered||!w.changed||w.saving||!!w.lakePoints||!!w.wetlandPoints},{id:"export",label:"Export a copy of water changes"},{id:"discard",label:"Discard water changes / use saved water",disabled:w.saving});
 return {id:"water",name:"Water changes",reason:reason||(w.dirty?"Unfinished water work is still open.":""),actions};
}
