import type {GeographicShape,GeographicTheme} from "./geographic";

export const GEOGRAPHIC_THEMES:{id:GeographicTheme;label:string;help:string}[]=[
  {id:"land",label:"Physical land and coastlines",help:"Show physical land independently of rivers, cities and political interpretations."},
  {id:"rivers",label:"Rivers and channels",help:"Show source-backed river, canal and lake-centerline paths. The source reader retains their classifications and original coordinates."},
  {id:"inland-water",label:"Lakes and inland waters",help:"Show mapped lakes and reservoirs. Their source edition describes its own geography, without establishing a historical date."},
  {id:"mountains",label:"Mountain ranges and peaks",help:"Show named mountain regions and recorded peak or spot-elevation locations. These are vector sources; a gridded elevation model is separate."},
  {id:"landscapes",label:"Landscape regions",help:"Show source-defined deserts, plains, plateaus, islands and other regions. Their approximate extents are not precise land cover or a climate model."},
  {id:"marine",label:"Seas and marine regions",help:"Show named oceans, seas and other marine source extents. Thematic outlines do not establish territorial ownership."},
  {id:"cities",label:"Cities and named places",help:"Show original populated-place locations, including source-classified stations and historic sites. No population, founding date or political allegiance is inferred."},
  {id:"administrative",label:"Administrative interpretations",help:"Show the provider's administrative and disputed accounts separately from physical geography. They do not create historical control records."},
  {id:"authored",label:"Authored geography",help:"Show original creator-authored representations in their declared coordinate context."},
];
export function shapeTheme(shape:Pick<GeographicShape,"theme"|"semantic">):GeographicTheme{return shape.theme??(shape.semantic==="administrative-boundary"?"administrative":shape.semantic==="physical-geography"?"land":"authored");}
export function geographicDrawOrder(shape:GeographicShape){return {land:0,marine:1,landscapes:2,mountains:3,"inland-water":4,rivers:5,administrative:6,authored:7,cities:8}[shapeTheme(shape)];}
export type GeographicLabel={id:string;text:string;x:number;y:number;fontSize:number;theme:GeographicTheme};
/** Display placement only; saved locations/geometry never change for a label. */
export function layoutGeographicLabels(shapes:GeographicShape[],canvasWidth=1000):GeographicLabel[]{
  const phone=canvasWidth<600,fontSize=Math.max(12,12*1000/Math.max(280,canvasWidth)),limit=phone?20:60,quota:Partial<Record<GeographicTheme,number>>=phone?{cities:8,rivers:3,"inland-water":2,mountains:3,landscapes:2,marine:2}:{cities:25,rivers:8,"inland-water":8,mountains:8,landscapes:6,marine:5};
  const candidates=shapes.filter(s=>s.label).sort((a,b)=>a.label!.rank-b.label!.rank||a.name.localeCompare(b.name)||(b.label!.weight??0)-(a.label!.weight??0)||a.label!.x-b.label!.x||a.label!.y-b.label!.y),seen=new Set<string>(),places=new Set<string>(),counts=new Map<GeographicTheme,number>(),boxes:number[][]=[],labels:GeographicLabel[]=[];
  for(const source of candidates){if(labels.length>=limit)break;const theme=shapeTheme(source),key=`${theme}:${source.name.toLocaleLowerCase()}`,anchor=source.label!;if(seen.has(key)||places.has(source.geographyId)||(counts.get(theme)??0)>=(quota[theme]??4))continue;const text=source.name.length>28?source.name.slice(0,27)+"…":source.name,width=text.length*fontSize*.72,height=fontSize*1.25;
    for(const direction of [1,-1]){const x=direction===1?anchor.x+fontSize*.5:anchor.x-width-fontSize*.5,y=anchor.y-fontSize*.3,box=[x,y-height,x+width,y+fontSize*.2];if(box[0]<4||box[1]<4||box[2]>996||box[3]>596||boxes.some(b=>box[0]<b[2]+fontSize*.4&&box[2]+fontSize*.4>b[0]&&box[1]<b[3]+fontSize*.3&&box[3]+fontSize*.3>b[1]))continue;labels.push({id:source.id,text,x,y,fontSize,theme});boxes.push(box);seen.add(key);places.add(source.geographyId);counts.set(theme,(counts.get(theme)??0)+1);break;}
  }
  return labels;
}
