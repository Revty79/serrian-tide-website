import "server-only";
import {nativeConnectionAccounts} from "./native-map-history-connection-source";
import {nativeConnectionBundle,nativeConnectionView,resolveNativeEndpoint} from "./native-map-history-connections";
import {nativeCraftRoutes,nativeCraftRouteView} from "./native-map-history-craft-routes";
import {nativeRelatedContext,nativeResource,type NativeContentContext} from "./native-map-history-context";
import type {NativeHistoryTx} from "./native-map-history-store";
import type {NativeMapTarget} from "./native-map-history";
import {nativeObjectPresent} from "./native-map-history";
import {nativeConditions} from "./native-map-history-conditions";
import {consumptionConnectionSchema,type ConsumptionGeometry} from "./atlas-map-consumption";
import {WorldError} from "./world-errors";
import {assertConsumptionGeography} from "./atlas-map-consumption-privacy";
import {z} from "zod";

type Connection=z.infer<typeof consumptionConnectionSchema>;
const endpoint=(context:NativeContentContext,point:{x:number;y:number},entranceId:string|null)=>({target:context.scope.target,versionId:context.version.id,geographyVersionId:context.authority?.version.id??null,entranceId,point});
export async function consumptionConnections(tx:NativeHistoryTx,c:NativeContentContext,geometry:ConsumptionGeometry){
 const connections:Connection[]=[];let unavailable=false;
 if(c.manifest.resources.some(r=>r.key==="connections"||r.key==="underground")){
  const accounts=await nativeConnectionAccounts(tx,c);
  for(const connection of (await nativeConnectionBundle(tx,c)).connections){
   if(!(await nativeConnectionView(tx,c,connection)).available){unavailable=true;continue;}
   const pins=accounts.get(connection.id)?.account.source;
   try{
    const from=await resolveNativeEndpoint(tx,c,connection.source,pins?.sourceVersionId,pins?.sourceGeographyVersionId),to=await resolveNativeEndpoint(tx,c,connection.destination,pins?.destinationVersionId,pins?.destinationGeographyVersionId);
    await assertConsumptionGeography(tx,from.context);await assertConsumptionGeography(tx,to.context);
    connections.push(consumptionConnectionSchema.parse({id:connection.id,kind:"entrance",twoWay:connection.twoWay,source:endpoint(from.context,from.point,connection.source.entranceId),destination:endpoint(to.context,to.point,connection.destination.entranceId)}));
   }catch(error){if(!(error instanceof WorldError))throw error;unavailable=true;}
  }
 }
 if(geometry.family==="floor"){
  const bundle=(await nativeResource(tx,c,"floor")).payload as unknown as {bundle:import("./building-floor").FloorBundle};
  const visible=new Set(geometry.design.features.map(f=>f.id));
  for(const f of bundle.bundle.document!.design.features)if(visible.has(f.id)&&f.variant==="object"&&f.destination){
   try{const to=await nativeRelatedContext(tx,c,{kind:"floor",id:f.destination.floorId});await assertConsumptionGeography(tx,to);
    const target=(await nativeResource(tx,to,"floor")).payload as unknown as {bundle:import("./building-floor").FloorBundle},d=target.bundle.document,b=target.bundle.building;
    if(!d||!b||d.archived||d.buildingId!==geometry.buildingId||f.destination.point.x>b.frame.width||f.destination.point.y>b.frame.height||!nativeObjectPresent((await nativeConditions(tx,to)).values,d.id))throw new WorldError("The recorded floor arrival is unavailable.",409);
    connections.push(consumptionConnectionSchema.parse({id:f.id,kind:"floor-transition",twoWay:false,source:endpoint(c,f.point,f.id),destination:endpoint(to,f.destination.point,null)}));
   }catch(error){if(!(error instanceof WorldError))throw error;unavailable=true;}
  }
 }
 if(geometry.family==="craft"||geometry.family==="deck"){
  const routes=await nativeCraftRoutes(tx,c);
  for(const connection of routes.rows){
   if(!(await nativeCraftRouteView(tx,c,connection)).available){unavailable=true;continue;}
   const account=routes.accounts.get(connection.id)?.account;
   const target=(surface:string):NativeMapTarget=>surface==="exterior"?{kind:"craft",id:geometry.family==="craft"?c.scope.target.id:geometry.craftId}:{kind:"deck",id:surface};
   const context=async(surface:string,pin?:string)=>{
    const t=target(surface);
    if(pin){const {loadNativeVersion,nativeManifestOf}=await import("./native-map-history-store"),{nativeContentContext}=await import("./native-map-history-context");const v=await loadNativeVersion(tx,c.worldId,pin,t);if(!v.stateId)throw new WorldError("This route has no retained appearance.",409);return nativeContentContext(tx,c.userId,c.worldId,{timelineId:c.scope.timelineId,target:nativeManifestOf(v).target,stateId:v.stateId,versionId:v.id,year:c.scope.year,edit:false},{ownerId:"",archived:false,review:true,ordinary:false});}
    return nativeRelatedContext(tx,c,t);
   };
   try{const from=await context(connection.source,account?.source.sourceVersionId),to=await context(connection.destination,account?.source.destinationVersionId);
    await assertConsumptionGeography(tx,from);await assertConsumptionGeography(tx,to);
    connections.push(consumptionConnectionSchema.parse({id:connection.id,kind:"craft-transition",twoWay:connection.twoWay,source:endpoint(from,connection.sourcePoint,connection.sourceFeatureId),destination:endpoint(to,connection.arrivalPoint,connection.arrivalFeatureId)}));
   }catch(error){if(!(error instanceof WorldError))throw error;unavailable=true;}
  }
 }
 return {connections,unavailable};
}
