import {previewGeographicImport} from "./geographic-import-preview";
import type {SpatialReference} from "./geographic";
self.onmessage=(event:MessageEvent<{source:unknown;reference:SpatialReference;focus?:number}>)=>{try{self.postMessage({result:previewGeographicImport(event.data.source,event.data.reference,event.data.focus)});}catch(e){self.postMessage({error:(e as Error).message});}};
