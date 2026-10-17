"use client";
import {createContext,useContext,useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {Brush,Globe2,Layers,History,Link2,Download,Sparkles,X,SlidersHorizontal,Save,BookOpen,Maximize2,Minimize2} from "lucide-react";
import styles from "./map-studio.module.css";

const panels=[['create','Create land',Globe2],['artwork','Artwork',Brush],['geography','Geography',Globe2],['generation','Generate',Sparkles],['display','Layers',Layers],['recovery','Save and recovery',Save],['help','Help',BookOpen],['history','History',History],['links','Connections',Link2],['export','Export',Download]] as const;
export type StudioSection=typeof panels[number][0];
type Studio={section:StudioSection;input:"artwork"|"geography";register:(section:StudioSection)=>()=>void;show:(section:StudioSection)=>void;hide:()=>void;inspector:HTMLDivElement|null;actions:HTMLElement|null};
const Context=createContext<Studio|null>(null);
export const useMapStudio=()=>useContext(Context);

/** One shell around the existing editors. Portaled panels remain mounted when hidden. */
export function MapStudio({worldName,timelineName,review,ordinary,children,initialSection="artwork",canvasFirst=false}:{worldName:string;timelineName:string;review:boolean;ordinary:boolean;children:ReactNode;initialSection?:StudioSection;canvasFirst?:boolean}){
 const [section,setSection]=useState<StudioSection>(initialSection),[open,setOpen]=useState(!canvasFirst),[expanded,setExpanded]=useState(false),[inspector,setInspector]=useState<HTMLDivElement|null>(null),[actions,setActions]=useState<HTMLElement|null>(null);
 const [input,setInput]=useState<"artwork"|"geography">(initialSection==="create"||initialSection==="geography"||initialSection==="generation"?"geography":"artwork"),[available,setAvailable]=useState<Partial<Record<StudioSection,number>>>({});
 const register=useCallback((id:StudioSection)=>{setAvailable(v=>({...v,[id]:(v[id]??0)+1}));return()=>{setAvailable(v=>({...v,[id]:Math.max(0,(v[id]??0)-1)}));};},[]);
 const pointers=useRef(new Set<number>());
 const lastTool=useRef<HTMLButtonElement|null>(null),close=useRef<HTMLButtonElement>(null),settings=useRef<HTMLButtonElement>(null),root=useRef<HTMLElement>(null);
 function show(value:StudioSection){if(pointers.current.size)return;if(value==="artwork")setInput("artwork");if(value==="create"||value==="geography"||value==="generation")setInput("geography");requestAnimationFrame(()=>{if(inspector)inspector.scrollTop=0;});setSection(value);setOpen(true);}
 useEffect(()=>{
 const previous=document.body.style.overflow;document.body.style.overflow='hidden';const viewport=window.visualViewport,navigation=document.querySelector('.authenticated-navigation');
 const size=()=>{const offset=viewport?.offsetTop??0,height=viewport?.height??window.innerHeight,compact=height<600,bottom=compact?offset:Math.max(offset,navigation?.getBoundingClientRect().bottom??0);if(root.current){root.current.dataset.compactHeight=String(compact);root.current.style.top=`${bottom}px`;root.current.style.height=`${Math.max(160,height-(bottom-offset))}px`;}};
 const endPointer=(event:PointerEvent)=>{pointers.current.delete(event.pointerId);};window.addEventListener('pointerup',endPointer,true);window.addEventListener('pointercancel',endPointer,true);
 size();const observer=new ResizeObserver(size);if(navigation)observer.observe(navigation);window.addEventListener('scroll',size);window.addEventListener('resize',size);viewport?.addEventListener('resize',size);viewport?.addEventListener('scroll',size);
 return()=>{document.body.style.overflow=previous;window.removeEventListener('pointerup',endPointer,true);window.removeEventListener('pointercancel',endPointer,true);observer.disconnect();window.removeEventListener('scroll',size);window.removeEventListener('resize',size);viewport?.removeEventListener('resize',size);viewport?.removeEventListener('scroll',size);};
 },[]);
 function dismiss(){if(pointers.current.size)return;setOpen(false);(lastTool.current??settings.current)?.focus({preventScroll:true});}
 const palette=<nav className={canvasFirst?styles.panelPalette:styles.palette} aria-label="Studio tools">{panels.filter(([id])=>(available[id]??0)>0).map(([id,label,Icon])=><button key={id} className="st-button is-secondary" aria-pressed={section===id} aria-controls="map-studio-inspector" onClick={e=>{lastTool.current=e.currentTarget;show(id);const menu=e.currentTarget.closest("details");if(menu)menu.open=false;}}><Icon size={19}/><span>{label}</span></button>)}</nav>;
 return <Context.Provider value={{section,input,register,show,hide:()=>setOpen(false),inspector,actions}}><section ref={root} className={styles.studio} aria-label="Map Studio" data-canvas-first={canvasFirst} data-inspector-open={open} data-inspector-expanded={expanded} onPointerDownCapture={e=>{if((e.target as Element).closest("[data-studio-canvas-frame] svg"))pointers.current.add(e.pointerId);}} onPointerUpCapture={e=>pointers.current.delete(e.pointerId)} onPointerCancelCapture={e=>pointers.current.delete(e.pointerId)} onLostPointerCapture={e=>pointers.current.delete(e.pointerId)} onKeyDown={e=>{if(e.key==='Escape'&&open&&!(e.target as Element).closest('dialog')){e.stopPropagation();dismiss();}}}>
  <header className={styles.context}><span>Map Studio</span><p>{worldName} · {timelineName}{review?' · Administrator review · Read-only':ordinary?' · Ordinary knowledge':''}</p><button ref={settings} className="st-button is-secondary" aria-expanded={open} aria-controls="map-studio-inspector" onClick={()=>{if(!pointers.current.size){if(open)dismiss();else setOpen(true);}}}><SlidersHorizontal size={16}/>{canvasFirst?"More tools":"Settings"}</button></header>
  {!canvasFirst&&palette}

  <div className={styles.editor}>{children}</div>
  <aside id="map-studio-inspector" className={styles.inspector} aria-label="Tool settings" inert={!open?true:undefined}><header><h2>{panels.find(p=>p[0]===section)?.[1]}</h2><button className={`st-button is-secondary ${styles.expand}`} aria-label={expanded?"Collapse tool settings":"Expand tool settings"} aria-expanded={expanded} onClick={()=>{if(!pointers.current.size)setExpanded(v=>!v);}}>{expanded?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button><button ref={close} className="st-button is-secondary" aria-label="Close tool settings" onClick={dismiss}><X size={18}/></button></header>{available[section]===0&&<p className={styles.unavailable}>These controls are unavailable in this map or viewing context. Choose another tool from the palette.</p>}{canvasFirst&&<details className={styles.toolsMenu}><summary>Choose map tools</summary>{palette}</details>}<div className={styles.inspectorScroll} ref={setInspector}/></aside>
  <footer className={styles.actions} aria-label="Map save and history actions" ref={setActions}/>
 </section></Context.Provider>;
}
export function StudioPanel({section,children,disabled=false}:{section:StudioSection;children:ReactNode;disabled?:boolean}){
 const studio=useMapStudio(),register=studio?.register;
 useEffect(()=>register?.(section),[register,section]);
 if(!studio)return <>{children}</>;
 if(!studio.inspector)return null;
 return createPortal(<div className={styles.panel} hidden={studio.section!==section} data-studio-panel={section}><fieldset disabled={disabled} className={styles.panelFields}>{children}</fieldset></div>,studio.inspector);
}
export function StudioActions({children}:{children:ReactNode}){
 const studio=useMapStudio();if(!studio)return <>{children}</>;return studio.actions?createPortal(children,studio.actions):null;
}
