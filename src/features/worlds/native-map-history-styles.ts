import "server-only";
import {stylePresetSaveSchema,captureStyleSpec,type StylePreset} from "./terrain-style-preset";
import {nativeResource,type NativeContentContext} from "./native-map-history-context";
import {assertNativeRevision,assertNativeTarget} from "./native-map-history-resources";
import type {NativeHistoryTx} from "./native-map-history-store";
import type {NativeWriteResult} from "./native-map-history-write";
import {WorldError} from "./world-service";

export async function saveNativeStyle(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=stylePresetSaveSchema.parse(raw);assertNativeTarget(c,command.mapId,"terrain");
  const appearance=await nativeResource(tx,c,"appearance");assertNativeRevision(appearance.revision,command.appearanceRevision);
  const stored=await nativeResource(tx,c,"styles"),value=structuredClone(stored.payload) as unknown as {available:boolean;presets:StylePreset[];revision?:number};
  if(value.presets.length>=128)throw new WorldError("This dated map reached its 128 retained named styles. Saved styles remain available.",413);
  const preset:StylePreset={id:command.requestId,version:1,name:command.name,spec:captureStyleSpec(command.spec),sourceMapId:c.scope.target.id,sourceAppearanceRevision:command.appearanceRevision,createdAt:new Date().toISOString(),createdBy:c.userId};
  value.presets=[preset,...value.presets];value.revision=stored.revision+1;value.available=true;
  return {updates:[{key:"styles",kind:"appearance",payload:value as unknown as Record<string,unknown>}],result:{...preset}};
}
