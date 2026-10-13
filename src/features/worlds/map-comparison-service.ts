import "server-only";
import { draftOf } from "./atlas";
import { getMapStates } from "./map-state-service";
import { getHistoricalConnections,coordinateHistoricalMap } from "./historical-connection-service";
import { resolveHistoricalConnections } from "./historical-connections";
import { mapComparisonSchema,compareMapSources,type MapSourceSelection,type ComparedMapSource } from "./map-source-comparison";

export async function compareHistoricalMaps(userId:string,worldId:string,input:unknown,options:{ordinary?:boolean;review?:boolean}={}){
  const c=mapComparisonSchema.parse(input);
  async function source(selection:MapSourceSelection):Promise<ComparedMapSource>{
    const state=await getMapStates(userId,worldId,c.mapId,selection.timelineId,{...options,year:selection.year,stateId:selection.stateId,versionId:selection.versionId,uncoordinated:true});
    const year=selection.year??state.selected!.startYear;
    const coordinated=await coordinateHistoricalMap(userId,worldId,c.mapId,selection.timelineId,year,state,options),history=await getHistoricalConnections(userId,worldId,c.mapId,selection.timelineId,options);
    const map=coordinated.bundle.maps.find(m=>m.id===c.mapId)!;
    return {timelineName:state.timelineName,year,coverage:state.selected?"established":"unknown",appearance:state.selected,draft:draftOf(map,coordinated.bundle.geographies),connections:coordinated.bundle.historicalConnectionPolicies??[],connectionAccounts:[...resolveHistoricalConnections(history.records,year).values()]};
  }
  const left=await source(c.left),right=await source(c.right);
  return {left,right,differences:compareMapSources(left,right)};
}
