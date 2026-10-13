import { z } from "zod";
import { atlasId, type MapDraft } from "./atlas";
import { yearSchema } from "./world-year";
import type { MapStateChoice } from "./map-states";
import type { HistoricalConnectionPolicy, HistoricalConnection } from "./historical-connections";

export const mapSourceSelectionSchema=z.object({timelineId:atlasId,year:yearSchema.optional(),stateId:atlasId.optional(),versionId:atlasId.optional()}).strict().refine(s=>(s.year!==undefined)!==!!s.stateId&&(!s.versionId||!!s.stateId),"Choose a World year or a saved appearance and its optional exact revision.");
export const mapComparisonSchema=z.object({mapId:atlasId,left:mapSourceSelectionSchema,right:mapSourceSelectionSchema}).strict();
export type MapSourceSelection=z.infer<typeof mapSourceSelectionSchema>;
export type ComparedMapSource={timelineName:string;year:number;coverage:"established"|"unknown";appearance:MapStateChoice|null;draft:MapDraft;connections:HistoricalConnectionPolicy[];connectionAccounts:HistoricalConnection[]};
export type SourceDifference={category:string;identity:string;left:unknown;right:unknown;status:"saved difference"|"unknown coverage"};
export type MapComparison={left:ComparedMapSource;right:ComparedMapSource;differences:SourceDifference[]};
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([k])=>k!=="revision").sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
export function compareMapSources(left:ComparedMapSource,right:ComparedMapSource):SourceDifference[]{
  const differences:SourceDifference[]=[],status=left.coverage==="unknown"||right.coverage==="unknown"?"unknown coverage":"saved difference";
  function records(category:string,a:unknown[],b:unknown[],key="id"){
    const keyed=(items:unknown[])=>new Map(items.map((item,i)=>{const r=item as Record<string,unknown>;return [String(r[key]??i),canonical(item)];})),l=keyed(a),r=keyed(b);
    for(const id of new Set([...l.keys(),...r.keys()]))if(JSON.stringify(l.get(id))!==JSON.stringify(r.get(id)))differences.push({category,identity:id,left:l.get(id)??null,right:r.get(id)??null,status});
  }
  records("Physical geography",left.draft.features,right.draft.features);
  records("Drawn geography",left.draft.drawings??[],right.draft.drawings??[]);
  records("Local place accounts",left.draft.geographies,right.draft.geographies);
  records("Settlement layouts",left.draft.settlementShapes??[],right.draft.settlementShapes??[]);
  records("Settlement places",left.draft.settlementEntities??[],right.draft.settlementEntities??[],"geographyId");
  records("Historical conditions",left.draft.historicalPlaces??[],right.draft.historicalPlaces??[],"geographyId");
  records("Political territories and relationships",left.draft.territories??[],right.draft.territories??[]);
  records("Historical connections",left.connections,right.connections,"geographyId");
  records("Connection source accounts",left.connectionAccounts,right.connectionAccounts);
  records("Map presentation",[{id:"presentation",presentation:left.draft.presentation,settlement:left.draft.settlementState}],[{id:"presentation",presentation:right.draft.presentation,settlement:right.draft.settlementState}]);
  records("Source account and provenance",[{id:"source",appearance:left.appearance,timeline:left.timelineName,coverage:left.coverage}],[{id:"source",appearance:right.appearance,timeline:right.timelineName,coverage:right.coverage}]);
  return differences;
}
