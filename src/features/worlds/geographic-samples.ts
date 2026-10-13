import "server-only";
import { createHash } from "node:crypto";
import naturalEarth from "../../../data/geography/natural-earth-110m-sample.json";
import { atlasPolygonToSource,sourceImportSchema,type SourceImport } from "./geographic";

export function geographicSample(kind:"earth"|"fictional"):SourceImport{
  if(kind==="earth")return sourceImportSchema.parse(naturalEarth);
  // Original project-authored sample in the Map Maker's planar coordinate space.
  const outline=atlasPolygonToSource([{x:150,y:180},{x:1200,y:180},{x:1200,y:1050},{x:150,y:1050}]);
  if(outline.type==="Polygon")outline.coordinates.push([[450,450],[450,650],[650,650],[650,450],[450,450]]);
  const records=[{externalId:"glass-island",name:"Glass Island",semantic:"authored-geography",geometry:outline,properties:{account:"Original fictional island and inland void; unrelated to Earth"},protected:false},{externalId:"copper-isles",name:"Copper Isles",semantic:"authored-geography",geometry:{type:"MultiPolygon",coordinates:[[[[1400,200],[1550,200],[1550,380],[1400,380],[1400,200]]],[[[1650,650],[1800,650],[1800,900],[1650,900],[1650,650]]]]},properties:{account:"Two independently drawn islands"},protected:false},{externalId:"glass-channel",name:"Glass Channel",semantic:"authored-geography",geometry:{type:"LineString",coordinates:[[1300,100],[1300,550],[1500,1100]]},properties:{account:"An original authored route, not a simulated event"},protected:false}];
  return sourceImportSchema.parse({version:1,provenance:{provider:"Serrian Tide original creator sample",dataset:"Glass Sea planar geography",edition:"Geo A 1",sourceUrl:"https://github.com/Revty79/serrian-tide-website",license:"Original project-authored sample",licenseUrl:"https://github.com/Revty79/serrian-tide-website",attribution:"Original Glass Sea sample",attributionRequired:false,fileSha256:createHash("sha256").update(JSON.stringify(records)).digest("hex"),originalCrs:"AUTHORED:glass-sea",parameters:"Original Map Maker coordinate model; planar local units; exact authored vertices; no Earth dataset, projection or generated History."},records});
}
