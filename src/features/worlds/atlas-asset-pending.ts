import type {PendingWorkItem} from "./terrain-pending-work";
import type {useAtlasAssets} from "./atlas-asset-client";
export function atlasAssetPending(s:ReturnType<typeof useAtlasAssets>,review:()=>void):PendingWorkItem{
 return {id:"image-layers",name:"Images & asset library",reason:s.dirty?s.imports.length?"An image import is retained for an exact retry.":s.libraryPending?"A library request is retained for an exact retry.":s.metadataDirty?"Asset details have not been saved or cancelled.":s.recovery?"A local image draft needs recovery.":"Image layers have unsaved changes.":"",review,actions:[...s.recovery?[{label:"Recover Image Draft",run:s.recover}]:[],{label:s.pending?"Retry Original Image Save":"Save Image Layers",run:()=>void s.save(),disabled:s.busy||!!s.recovery},{label:"Export Image Draft",run:s.exportDraft},{label:"Discard draft / load saved artwork",run:()=>void s.reload(),disabled:s.busy}]};
}
