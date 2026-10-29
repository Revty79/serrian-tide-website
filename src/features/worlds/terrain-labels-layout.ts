import {type MapLabel,type LabelsLayer} from "./terrain-labels";
import type {HydroGeometry,HydroPoint} from "./terrain-hydrology";
import {waterDx} from "./terrain-water-geometry";
export type LabelMeasure=(text:string,font:string)=>number;
export type LabelText={lines:string[];width:number;height:number;font:string;size:number;family:string;cost:number;advances:number[];graphemes:string[]};
export type LabelBox={x:number;y:number;width:number;height:number};
export type LaidLabel={label:MapLabel;text:LabelText;box:LabelBox;origin:HydroPoint;glyphs?:{text:string;x:number;y:number;angle:number}[];pathFallback?:boolean};
export function labelTypography(l:MapLabel,appearance:string){const preset=l.preset==="auto"?appearance==="illustrated-fantasy"||appearance==="engraved-fantasy"?"fantasy":["classic-elevation","physical-relief","topographic"].includes(appearance)?"scientific":"reference":l.preset,family=l.family==="auto"?preset==="fantasy"?"Georgia, 'Times New Roman', serif":"Arial, Helvetica, sans-serif":l.family==="serif"?"Georgia, 'Times New Roman', serif":l.family==="mono"?"'Courier New', monospace":"Arial, Helvetica, sans-serif";return {family,font:`${l.italic?"italic ":""}${l.weight} ${l.sizePx}px ${family}`,preset};}
export function labelGraphemes(text:string){return typeof Intl.Segmenter!=="undefined"?[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(text)].map(s=>s.segment):Array.from(text);}
export function shapeLabel(l:MapLabel,appearance:string,measure:LabelMeasure):LabelText{
 const {font,family}=labelTypography(l,appearance),width=(s:string)=>Math.max(0,measure(s,font)+Math.max(0,labelGraphemes(s).length-1)*l.spacing),lines:string[]=[];
 if(l.mode==="path")lines.push(l.text);else for(const paragraph of l.text.split("\n")){let line="";for(const word of paragraph.split(/\s+/)){const next=line?line+" "+word:word;if(line&&width(next)>l.maxWidthPx){lines.push(line);line="";}if(width(word)>l.maxWidthPx){for(const glyph of labelGraphemes(word)){if(line&&width(line+glyph)>l.maxWidthPx){lines.push(line);line="";}line+=glyph;}}else line=line?line+" "+word:word;}lines.push(line);}
 const shown=lines.slice(0,8);if(lines.length>8)shown[7]+="…";const graphemes=l.mode==="path"?labelGraphemes(l.text):[],advances=graphemes.map(g=>Math.max(1,measure(g,font)+l.spacing));return {lines:shown,width:Math.max(1,...shown.map(width)),height:Math.max(1,shown.length)*l.sizePx*1.25,font,size:l.sizePx,family,cost:shown.reduce((n,line)=>n+labelGraphemes(line).length,0),graphemes,advances};
}
export function unwrapLabelPath(points:HydroPoint[],world:HydroGeometry){const out:HydroPoint[]=[];for(const p of points)out.push({x:out.length?out.at(-1)!.x+waterDx(out.at(-1)!.x,p.x,world):p.x,y:p.y});return out;}
export function pointOnLabelPath(points:HydroPoint[],distance:number){let remaining=Math.max(0,distance);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(len&&remaining<=len)return {x:a.x+(b.x-a.x)*remaining/len,y:a.y+(b.y-a.y)*remaining/len,angle:Math.atan2(b.y-a.y,b.x-a.x)};remaining-=len;}const a=points.at(-2)??points[0],b=points.at(-1)??a;return {x:b.x,y:b.y,angle:Math.atan2(b.y-a.y,b.x-a.x)};}
export function pathLabelGlyphs(l:MapLabel,text:LabelText,scale:number,world:HydroGeometry){
 let points=unwrapLabelPath(l.path,world).map(p=>({x:p.x*scale,y:p.y*scale}));if(points.length<2)return null;
 const length=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);let mid=pointOnLabelPath(points,length/2);if(Math.abs(Math.cos(mid.angle))<1e-8?Math.sin(mid.angle)<0:Math.cos(mid.angle)<0){points=points.reverse();mid=pointOnLabelPath(points,length/2);}
 const total=text.advances.reduce((n,v)=>n+v,0),joined=/[\u0590-\u0fff\u200d]/u.test(l.text);
 if(joined||total>length*.9)return {glyphs:[{text:l.text,x:mid.x,y:mid.y,angle:mid.angle}],fallback:true};
 let cursor=(length-total)/2;const glyphs=text.graphemes.map((g,i)=>{const p=pointOnLabelPath(points,cursor+text.advances[i]/2);cursor+=text.advances[i];return {text:g,...p};});
 if(glyphs.some((g,i)=>i&&Math.abs(Math.atan2(Math.sin(g.angle-glyphs[i-1].angle),Math.cos(g.angle-glyphs[i-1].angle)))>Math.PI/5))return {glyphs:[{text:l.text,x:mid.x,y:mid.y,angle:mid.angle}],fallback:true};
 return {glyphs,fallback:false};
}
export function labelOverlap(a:LabelBox,b:LabelBox){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
export function rotatedLabelBox(x:number,y:number,width:number,height:number,angle:number):LabelBox{const w=Math.abs(Math.cos(angle))*width+Math.abs(Math.sin(angle))*height,h=Math.abs(Math.sin(angle))*width+Math.abs(Math.cos(angle))*height;return {x:x-w/2-3,y:y-h/2-3,width:w+6,height:h+6};}
/** Fixed-size spatial bins bound collision work. Very wide labels use a bounded
 * overflow list rather than allocating thousands of bins. */
class CollisionBins{
 private bins=new Map<string,LabelBox[]>();private wide:LabelBox[]=[];
 private keys(b:LabelBox){const keys:string[]=[];for(let y=Math.floor(b.y/128);y<=Math.floor((b.y+b.height)/128);y++)for(let x=Math.floor(b.x/128);x<=Math.floor((b.x+b.width)/128);x++){if(keys.length>=256)return null;keys.push(x+":"+y);}return keys;}
 overlaps(b:LabelBox){if(this.wide.some(a=>labelOverlap(a,b)))return true;const keys=this.keys(b);if(!keys)return [...this.bins.values()].some(items=>items.some(a=>labelOverlap(a,b)));return keys.some(k=>this.bins.get(k)?.some(a=>labelOverlap(a,b)));}
 add(b:LabelBox){const keys=this.keys(b);if(!keys){this.wide.push(b);return;}for(const key of keys){const list=this.bins.get(key)??[];list.push(b);this.bins.set(key,list);}}
}
export function planLabels(layer:LabelsLayer,world:HydroGeometry,scale:number,appearance:string,measure:LabelMeasure,selectedId?:string|null){
 const labels:LaidLabel[]=[],collisions=new CollisionBins(),period=world.width*scale;let hidden=0,scaleHidden=0,glyphs=0;
 if(!layer.visible||period<8)return {labels,hidden,scaleHidden:period<8?layer.labels.length:0,glyphs};
 const ordered=layer.labels.filter(l=>l.visible&&l.opacity>0).sort((a,b)=>Number(b.id===selectedId)-Number(a.id===selectedId)||Number(b.force)-Number(a.force)||b.priority-a.priority||a.id.localeCompare(b.id));
 for(const label of ordered){if(1/scale<label.minMpp||1/scale>label.maxMpp){scaleHidden++;continue;}const text=shapeLabel(label,appearance,measure),origin={x:label.anchor.x*scale,y:label.anchor.y*scale},angle=label.rotation*Math.PI/180,path=label.mode==="path"?pathLabelGlyphs(label,text,scale,world):null;let box=rotatedLabelBox(origin.x,origin.y+(label.mode==="point"?-text.height/2-12:0),text.width,text.height,angle);
  if(!path){const offset=label.align==="left"?text.width/2:label.align==="right"?-text.width/2:0;box=rotatedLabelBox(origin.x+offset*Math.cos(angle),origin.y+(label.mode==="point"?-text.height/2-12:0)+offset*Math.sin(angle),text.width,text.height,angle);}
  if(path){const boxes=path.glyphs.map((g,i)=>rotatedLabelBox(g.x,g.y,path.fallback?text.width:text.advances[i],text.size*1.25,g.angle+angle)),left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y));box={x:left,y:top,width:Math.max(...boxes.map(b=>b.x+b.width))-left,height:Math.max(...boxes.map(b=>b.y+b.height))-top};}
  const copies=(world.wrap?[-period,0,period]:[0]).map(offset=>({...box,x:box.x+offset}));
  if(label.id!==selectedId&&!label.force&&copies.some(b=>collisions.overlaps(b))){hidden++;continue;}
  const cost=path&&!path.fallback?path.glyphs.length:1;glyphs+=cost;for(const b of copies)collisions.add(b);labels.push({label,text,box,origin,...path?{glyphs:path.glyphs,pathFallback:path.fallback}:{}});
 }
 return {labels,hidden,scaleHidden,glyphs};
}
export function visibleLabelCopies(p:LaidLabel,view:{x:number;y:number;scale:number},world:HydroGeometry,width:number,height:number){return (world.wrap?[-world.width,0,world.width]:[0]).map(x=>x*view.scale).filter(offset=>{const b={...p.box,x:p.box.x+view.x+offset,y:p.box.y+view.y};return b.x+b.width>=0&&b.x<=width&&b.y+b.height>=0&&b.y<=height;});}
