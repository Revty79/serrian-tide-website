/// <reference lib="webworker" />
import {sourceGeometrySchema,focusedGeographicExtent,type GeographicBounds,type SpatialReference,type SourceValidation} from './geographic';
import {geometryBounds,validateSourceGeometry} from './geographic-geometry';
import {boundedSourceDisplay} from './geographic-display';
self.onmessage=({data}:{data:{geometry:unknown;original:unknown;reference:SpatialReference;bounds:GeographicBounds|null;validation:SourceValidation}})=>{
 try{const g=sourceGeometrySchema.parse(data.geometry),original=sourceGeometrySchema.parse(data.original),bounds=data.bounds??focusedGeographicExtent(geometryBounds(g,data.reference),data.reference),kind=data.reference.kind==='sphere'?'equirectangular':'planar';let error='';try{validateSourceGeometry(g,data.reference,data.validation);}catch(e){error=(e as Error).message;}
  self.postMessage({result:{bounds,path:boundedSourceDisplay(g,data.reference,bounds,kind).path,originalPath:boundedSourceDisplay(original,data.reference,bounds,kind).path,error}});
 }catch(e){self.postMessage({error:(e as Error).message});}
};
