import "server-only";
import {db} from "@/db";
import {worldEnvironment,worldEnvironmentVersion} from "@/db/world-environment-schema";
import {geographyTemplateEnvironment,type GeographyTemplateEnvironment} from "./map-template-geography";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Initialize only a newly accepted World; existing climate/manual coverage is never overwritten. */
export async function createTemplateEnvironment(tx:Tx,userId:string,worldId:string,mapId:string,preset:GeographyTemplateEnvironment,world:{width:number;height:number;wrap:boolean},requestId:string){
 const layer=geographyTemplateEnvironment(preset,world);await tx.insert(worldEnvironment).values({mapId,worldId,revision:1,layer,updatedBy:userId});await tx.insert(worldEnvironmentVersion).values({mapId,worldId,revision:1,previousRevision:null,restoredFromRevision:null,layer,requestId,createdBy:userId});
}
