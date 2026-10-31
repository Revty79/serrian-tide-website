import {artworkLayerSchema,type ArtworkLayer} from "./terrain-artwork";
import {environmentLayerSchema,type EnvironmentLayer,type EnvironmentRegion} from "./terrain-environment";
import {hydroLayerSchema,type HydroLayer} from "./terrain-hydrology";
import {labelsLayerSchema,type LabelsLayer} from "./terrain-labels";
import {terrainMaterialsSchema,type TerrainMaterials} from "./terrain-materials";
import {mergeRegionalRecords,regionalEqual,requireRegionalArtwork,requireRegionalFrame,requireRegionalPath,requireRegionalPathChange,requireRegionalSettings,type RegionalScope} from "./terrain-regional-scope";

export function regionalMaterials(before:TerrainMaterials,after:TerrainMaterials,scope:RegionalScope){
 requireRegionalSettings(before,after,["strokes"]);if(before.locked&&!regionalEqual(before,after))throw Error("The parent material layer is locked. Unlock it on the World map before painting.");
 return terrainMaterialsSchema.parse({...before,strokes:mergeRegionalRecords(before.strokes,after.strokes,(stroke,old)=>{requireRegionalPath(stroke.points,stroke.radiusM,scope,"The material brush");if(old)requireRegionalPath(old.points,old.radiusM,scope,"The original material stroke");})});
}
function regionFootprint(region:EnvironmentRegion,scope:RegionalScope){requireRegionalPath(region.points,region.shape==="brush"?region.radiusM:0,scope,"The environmental override",region.shape==="polygon");}
export function regionalEnvironment(before:EnvironmentLayer,after:EnvironmentLayer,scope:RegionalScope){
 requireRegionalSettings(before,after,["fields","regions"]);
 const fields=mergeRegionalRecords(before.fields,after.fields,(field,old)=>{if(!field.contextId||old&&!old.contextId)throw Error("Global climate generation remains a World-level operation.");requireRegionalFrame(field.frame,scope,"The local climate field");if(old)requireRegionalFrame(old.frame,scope,"The original climate field");});
 const regions=mergeRegionalRecords(before.regions,after.regions,(region,old)=>{regionFootprint(region,scope);if(old)regionFootprint(old,scope);});
 return environmentLayerSchema.parse({...before,fields,regions});
}
export function regionalArtwork(before:ArtworkLayer,after:ArtworkLayer,scope:RegionalScope){
 requireRegionalSettings(before,after,["placements"]);
 return artworkLayerSchema.parse({...before,placements:mergeRegionalRecords(before.placements,after.placements,(placement,old)=>{requireRegionalArtwork(placement,scope);if(old)requireRegionalArtwork(old,scope);})});
}
export function regionalLabels(before:LabelsLayer,after:LabelsLayer,scope:RegionalScope){
 // Visibility, suggestions and screen-relative composition belong to the regional presentation.
 requireRegionalSettings(before,after,["labels","composition","visible","suggestions"]);
 return labelsLayerSchema.parse({...before,labels:mergeRegionalRecords(before.labels,after.labels,(label,old)=>{requireRegionalPath([label.anchor,...label.path],0,scope,"The geographic label");if(old)requireRegionalPath([old.anchor,...old.path],0,scope,"The original geographic label");})});
}
export function regionalHydrology(before:HydroLayer,after:HydroLayer,scope:RegionalScope){
 const presentation={detail:"balanced" as const,banks:true,symbols:true};
 if(before.presentation&&!after.presentation)throw Error("Retain the parent water presentation while editing local geography.");
 requireRegionalSettings({...before,presentation:before.presentation??presentation},{...after,presentation:after.presentation??presentation},["systemVersion","analyses","nodes","edges","lakes","catchments","features"]);
 if((after.systemVersion??1)<(before.systemVersion??1))throw Error("A regional writer cannot discard accepted water relationships.");
 const nodes=mergeRegionalRecords(before.nodes,after.nodes,(node,old)=>{requireRegionalPath([node.point],0,scope,"The water node");if(old)requireRegionalPath([old.point],0,scope,"The original water node");});
 const analyses=mergeRegionalRecords(before.analyses,after.analyses,(analysis,old)=>{requireRegionalFrame(analysis.focus,scope,"The water analysis");if(old)requireRegionalFrame(old.focus,scope,"The original water analysis");});
 const edges=mergeRegionalRecords(before.edges,after.edges,(edge,old)=>{
  // The established point editor marks a moved derived course manual/protected.
  // Permit only that bookkeeping change alongside the bounded interior path.
  if(old&&!regionalEqual(old.points,edge.points)&&(regionalEqual({...old,points:[]},{...edge,points:[]})||regionalEqual({...old,points:[],flowKind:old.flowKind==="exception"?"exception":"manual",protected:true},{...edge,points:[]}))){requireRegionalPathChange(old.points,edge.points,scope,"This river adjustment",(edge.widthM??0)/2);return;}
  requireRegionalPath(edge.points,(edge.widthM??0)/2,scope,"This river continues outside the region");if(old)requireRegionalPath(old.points,(old.widthM??0)/2,scope,"The original river");
 });
 const rings=(value:{rings:{x:number;y:number}[][]},name:string)=>{for(const ring of value.rings)requireRegionalPath(ring,0,scope,name,true);};
 const lakes=mergeRegionalRecords(before.lakes??[],after.lakes??[],(lake,old)=>{for(const value of [lake,...old?[old]:[]]){rings(value,"The lake shoreline");requireRegionalPath([value.seed],0,scope,"The lake seed");for(const id of [...value.inletNodeIds,...value.outletNodeId?[value.outletNodeId]:[]]){const node=after.nodes.find(node=>node.id===id)??before.nodes.find(node=>node.id===id);if(node)requireRegionalPath([node.point],0,scope,"The lake connection");}}});
 const catchments=mergeRegionalRecords(before.catchments??[],after.catchments??[],(catchment,old)=>{for(const value of [catchment,...old?[old]:[]]){rings(value,"The watershed");requireRegionalPath([value.outlet,value.terminal],0,scope,"The watershed connections");}});
 const features=mergeRegionalRecords(before.features??[],after.features??[],(feature,old)=>{for(const value of [feature,...old?[old]:[]])if(value.kind==="wetland")rings(value,"The wetland");else requireRegionalPath([value.point],0,scope,"The water feature");});
 return hydroLayerSchema.parse({...before,...after.presentation?{presentation:after.presentation}:{},...after.systemVersion?{systemVersion:after.systemVersion}:{},analyses,nodes,edges,...after.lakes||before.lakes?{lakes}:{},...after.catchments||before.catchments?{catchments}:{},...after.features||before.features?{features}:{}});
}
