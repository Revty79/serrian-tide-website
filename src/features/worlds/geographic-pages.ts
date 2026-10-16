import type { GeographicViewport } from "./geographic";

export class GeographicPageError extends Error {constructor(message:string,public clear:boolean){super(message);}}
const cursorOf=(id:string,part:number)=>`${id}:${part}`;
function cursorAfter(a:string,b:string){const [ai,ap]=a.split(":"),[bi,bp]=b.split(":");return ai>bi||ai===bi&&Number(ap)>Number(bp);}
/** One request attempt only. Never seed it with an earlier view or retry. */
export function geographicPages(mapId:string){
  const shapes=new Map<string,GeographicViewport["shapes"][number]>(),credits=new Map<string,GeographicViewport["attributions"][number]>(),pages=new Set<string>();
  let first:GeographicViewport|undefined,last:GeographicViewport|undefined;
  return {
    append(value:GeographicViewport,after:string){
      if(value.layer.mapId!==mapId||first&&(value.readerId!==first.readerId||value.context!==first.context||value.canEdit!==first.canEdit||JSON.stringify(value.layer)!==JSON.stringify(first.layer)||JSON.stringify(value.bounds)!==JSON.stringify(first.bounds)||value.projection!==first.projection||value.lod!==first.lod))throw new GeographicPageError("The geographic sources or access changed while loading. Retry to read the current view.",true);
      const final=value.shapes.at(-1),next=value.nextCursor;
      if(pages.has(after)||pages.size>=4096||next&&(!final||next!==cursorOf(final.id,final.part)||after&&!cursorAfter(next,after)))throw new GeographicPageError("The geographic view could not finish. Retry this extent or zoom closer.",false);
      const keys=new Set<string>();let previous=after;
      for(const shape of value.shapes){const key=`${shape.id}:${shape.versionId}:${shape.part}`,cursor=cursorOf(shape.id,shape.part);if(keys.has(key)||shapes.has(key)||previous&&!cursorAfter(cursor,previous))throw new GeographicPageError("The geographic pages did not advance. Retry this extent.",false);keys.add(key);previous=cursor;}
      pages.add(after);first??=value;last=value;
      for(const shape of value.shapes)shapes.set(`${shape.id}:${shape.versionId}:${shape.part}`,shape);
      for(const credit of value.attributions)credits.set(JSON.stringify(credit),credit);
    },
    value(){return last?{...last,shapes:[...shapes.values()],attributions:[...credits.values()]}:null;},
  };
}
