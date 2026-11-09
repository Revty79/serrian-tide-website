import {sourceImportSchema,coordinateCount,surfaceBounds,focusedGeographicExtent,sameSpatialReference,type SourceImport,type SpatialReference,type GeographicBounds} from "./geographic";
import {geometryBounds,validateSourceGeometry} from "./geographic-geometry";
import {validateReference} from "./geographic";
import {boundedSourceDisplay} from "./geographic-display";

export type GeographicImportReview={bounds:GeographicBounds;provider:string;dataset:string;edition:string;credit:string;records:{externalId:string;name:string;semantic:string;parentId:string|null;geographyId:string|null;vertices:number;path:string;tolerance:number}[]};
export function previewGeographicImport(input:unknown,reference:SpatialReference,focus?:number):GeographicImportReview{
 const source=sourceImportSchema.parse(input);validateReference(reference);
 if(source.provenance.originalCrs!==reference.crs)throw Error("The source coordinate reference must match the selected surface. No reprojection is inferred.");
 if(new Set(source.records.map(r=>r.externalId)).size!==source.records.length)throw Error("Each source identifier must be unique in the batch.");
 const associated=source.records.flatMap(r=>r.geographyId?[r.geographyId]:[]);if(new Set(associated).size!==associated.length)throw Error("Use one source record per selected saved place in this batch.");
 if(focus!==undefined&&(!Number.isInteger(focus)||!source.records[focus]))throw Error("Choose a record in this source batch.");
 for(const r of source.records){try{validateSourceGeometry(r.geometry,reference,source.provenance.validation);}catch(e){throw Error(`${r.name}: ${(e as Error).message}`);}}
 const bounds=focus===undefined?surfaceBounds(reference):focusedGeographicExtent(geometryBounds(source.records[focus].geometry,reference),reference),kind=reference.kind==="sphere"?"equirectangular":"planar";
 return {bounds,provider:source.provenance.provider,dataset:source.provenance.dataset,edition:source.provenance.edition,credit:source.provenance.attribution,records:source.records.map(r=>({externalId:r.externalId,name:r.name,semantic:r.semantic,parentId:r.parentId??null,geographyId:r.geographyId??null,vertices:coordinateCount(r.geometry),...boundedSourceDisplay(r.geometry,reference,bounds,kind,4,Math.min(64000,Math.floor(512000/source.records.length)))}))};
}
/** A review belongs to an exact draft, selected coordinate surface and destination. */
export function sameGeographicImportReview(review:{source:SourceImport;surfaceId:string;mapId:string}|null,source:SourceImport|null,surfaceId:string,mapId:string){return !!review&&review.source===source&&review.surfaceId===surfaceId&&review.mapId===mapId;}
export {sameSpatialReference};
