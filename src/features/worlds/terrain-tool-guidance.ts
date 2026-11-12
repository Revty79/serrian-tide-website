import type {TerrainCanvasTool} from "./terrain-canvas";

export const terrainToolNames:Record<TerrainCanvasTool,string>={
 raise:"Raise mountains",lower:"Lower / carve valleys",smooth:"Smooth",level:"Flatten",sample:"Sample height",
 "coast-land":"Extend land","coast-water":"Carve a bay","coast-smooth":"Smooth shoreline",
 region:"Regional boundary",refine:"Terrain detail area",pan:"Pan",inspect:"Inspect",measure:"Measure",
 material:"Ground Materials",environment:"Environment",water:"Waterways",locations:"Towns & settlements",
 artwork:"Artwork",labels:"Labels & layout",select:"Select area",path:"Draw path",
};
export function terrainToolGesture(tool:TerrainCanvasTool){
 if(tool==="pan")return "Drag to move the view without drawing.";
 if(tool==="inspect")return "Move over the map to read its height and position. Drag to pan.";
 if(tool==="measure")return "Click or tap points to measure. Keep or clear the measurement in the map controls.";
 if(tool==="sample")return "Click land to copy its elevation into the Flatten target; this does not change terrain.";
 if(tool==="region")return "Draw the chosen boundary, then preview, name and save the linked region in Options.";
 if(tool==="refine"||tool==="select")return "Draw the selected area; review its preview before accepting changes.";
 if(tool==="path")return "Click or tap path points. Review the operation before accepting it.";
 if(tool==="material")return "Drag to paint ground materials. Completed strokes autosave; heights stay unchanged.";
 if(tool==="environment")return "Paint coverage or follow the selected boundary tool, then Save Changes. Heights stay unchanged.";
 if(tool==="water")return "Choose a water tool in Options, then place its source or shoreline points. Review, accept and save.";
 if(tool==="locations")return "Choose a settlement action in Options before placing or moving its marker.";
 if(tool==="artwork"||tool==="labels")return "Choose an item or placement action in Options. Review its preview, accept and save.";
 return "Drag to sculpt with this brush. Release to finish; completed strokes autosave. Undo reverses the active terrain edit.";
}
