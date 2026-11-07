import "server-only";
import { inArray, sql, type SQLWrapper } from "drizzle-orm";
import { worldOrdinaryContent, worldScopeAllowed, worldProtectedContent } from "./world-access-service";
import { loreWorldScope, nativeWorldScope } from "./world-permissions";
import { worldUnavailable } from "./world-errors";

export const reviewedLoreFamilies = ["species","people","origin","relationship","culture","civilization","language","population","belief","tradition","individual","polity","government","institution","office","appointment","claim","agreement","conflict","organization","organizationRole","membership","assignment","network","cosmicFramework","realm","celestial","cosmicPrinciple","cosmicConnection","skyCycle","skyObservation","skyCalendarLink","story"] as const;
export function worldLoreFamilyAllowed(worldId:string,family:string){return worldScopeAllowed(worldId,loreWorldScope(family));}
export function worldLoreFamilyWhere(worldId:string,column:SQLWrapper){
  const allowed=reviewedLoreFamilies.filter(family=>worldLoreFamilyAllowed(worldId,family));
  return allowed.length?inArray(column,allowed):sql`false`;
}
export function requireWorldLoreFamily(worldId:string,family:string){if(!worldLoreFamilyAllowed(worldId,family))throw worldUnavailable();}
export function requireWorldNativeFamily(worldId:string,kind:string){if(!worldScopeAllowed(worldId,nativeWorldScope(kind)))throw worldUnavailable();}
export function worldGeographyAllowed(worldId:string){return worldScopeAllowed(worldId,"settlements");}
export function worldTimekeepingAllowed(worldId:string){return worldScopeAllowed(worldId,"timekeeping");}
export function ordinaryWorldResource(worldId:string,requested=false){return worldOrdinaryContent(worldId,requested);}

export const permittedCompositionKinds=(worldId:string)=>(["terrain","town","floor","underground","craft","craft-deck"] as const).filter(kind=>worldScopeAllowed(worldId,nativeWorldScope(kind))&&(kind!=="underground"||worldProtectedContent(worldId)));
