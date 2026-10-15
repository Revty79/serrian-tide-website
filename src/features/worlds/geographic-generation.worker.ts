import {generateGeography,type GeographicRecipe} from "./geographic-generation";
self.onmessage=(event:MessageEvent<GeographicRecipe>)=>{try{self.postMessage({result:generateGeography(event.data)});}catch(error){self.postMessage({error:(error as Error).message});}};
