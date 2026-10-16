import {geographicDrawOrder,layoutGeographicLabels,shapeTheme} from "./geographic-themes";
import type {GeographicViewport} from "./geographic";
import styles from "./geographic.module.css";

export type GeographicImage={url:string;opacity:number}|null;
/** Shared bounded source rendering. The caller owns its canvas and interaction coordinates. */
export function GeographicScene({viewport,elevation,landCover,labelsVisible=true,canvasWidth=1000,onChoose,flipY=false,boundedKeyboard=false,themes}:{viewport:GeographicViewport;elevation:GeographicImage;landCover:GeographicImage;labelsVisible?:boolean;canvasWidth?:number;onChoose?:(id:string)=>void;flipY?:boolean;boundedKeyboard?:boolean;themes?:string[]}){
 const groups=new Map<string,GeographicViewport["shapes"]>();
 const visible=viewport.shapes.filter(s=>!themes||themes.includes(shapeTheme(s)));
 for(const shape of [...visible].filter(s=>s.path).sort((a,b)=>geographicDrawOrder(a)-geographicDrawOrder(b))){const group=groups.get(shape.id)??[];group.push(shape);groups.set(shape.id,group);}
 const labels=labelsVisible?layoutGeographicLabels(visible,canvasWidth):[];
 const first=groups.keys().next().value;
 const keyboard=(id:string,label=false)=>onChoose?{role:"button",tabIndex:boundedKeyboard?(id===first&&!label?0:-1):0,onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onChoose(id);}}}:{};
 return <g className={styles.sourceScene} data-geographic-scene data-relief={elevation||landCover?"true":undefined}>
  <g transform={flipY?"translate(0 600) scale(1 -1)":undefined}>
  {elevation&&<image data-raster-image="relief" href={elevation.url} opacity={elevation.opacity} width={1000} height={600} pointerEvents="none"/>}
  {landCover&&<image data-raster-image="land-cover" href={landCover.url} opacity={landCover.opacity} width={1000} height={600} pointerEvents="none"/>}
  {[...groups].map(([id,shapes])=><g key={id} data-source={id} aria-label={`Read geographic source: ${shapes[0].name}`} {...keyboard(id)}>{shapes.map(s=><path key={`${s.part}:${s.versionId}`} d={s.path} className={styles.shape} fillRule="evenodd" data-semantic={s.semantic} data-geometry-type={s.geometryType} data-source-style={s.style}/>)}</g>)}
  </g>{labels.map(label=><g key={label.id} data-source={label.id} aria-label={`Read labeled source: ${label.text}`} {...keyboard(label.id,true)}><text className={styles.mapLabel} x={label.x} y={flipY?600-label.y:label.y} fontSize={label.fontSize} data-theme={label.theme}>{label.text}</text></g>)}
 </g>;
}
