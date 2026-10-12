"use client";

import { useEffect, useLayoutEffect, useId, useRef, type ReactNode } from "react";
import styles from "./creator-workshop.module.css";

/** Only the centre scrolls. The owner holds the draft and controls save boundaries. */
export function CreatorWorkshop({title,introduction,sections,section,onSection,onClose,children,preview,footer,embedded=false,viewKey="parent",navigationLabel="Workshop sections"}: {
  title:string; introduction:string; sections:{id:string;label:string}[]; section:string;
  onSection:(id:string)=>void; onClose:()=>void;
  children:ReactNode; preview:ReactNode; footer:ReactNode;
  embedded?:boolean;viewKey?:string;navigationLabel?:string;
}) {
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),positions=useRef(new Map<string,number>()),id=useId();
  useEffect(()=>{if(embedded)return;const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>previous?.focus();},[embedded]);
  useLayoutEffect(()=>{const key=`${viewKey}:${section}`,element=content.current,savedPositions=positions.current;element?.scrollTo({top:savedPositions.get(key)??0});return()=>{if(element)savedPositions.set(key,element.scrollTop);};},[section,viewKey]);
  // VisualViewport follows software keyboards without resizing the shared application.
  useEffect(()=>{if(embedded)return;const viewport=window.visualViewport;const resize=()=>{if(dialog.current&&viewport){const keyboard=viewport.height<window.innerHeight-24;dialog.current.style.maxHeight=`${Math.max(160,viewport.height-16)}px`;dialog.current.style.top=keyboard?`${viewport.offsetTop+8}px`:"";dialog.current.style.bottom=keyboard?"auto":"";if(keyboard)requestAnimationFrame(()=>{if(dialog.current?.contains(document.activeElement))(document.activeElement as HTMLElement)?.scrollIntoView({block:"nearest"});});}};resize();viewport?.addEventListener("resize",resize);return()=>viewport?.removeEventListener("resize",resize);},[embedded]);
  const navigation=<nav className={styles.nav} aria-label={navigationLabel}>{sections.map(item=><button key={item.id} type="button" aria-current={section===item.id?"page":undefined} onClick={()=>onSection(item.id)}>{item.label}</button>)}<button type="button" className={embedded?undefined:styles.previewTab} aria-current={section==="preview"?"page":undefined} onClick={()=>onSection("preview")}>Preview</button></nav>;
  if(embedded)return <section aria-label="Related creation workshop"><p>{introduction}</p>{navigation}<div ref={content}><div hidden={section==="preview"}>{children}</div><div hidden={section!=="preview"}>{preview}</div></div>{footer}</section>;
  return <dialog ref={dialog} className={styles.window} aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className={styles.layout}>
      <header className={styles.header}><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-intro`}>{introduction}</p></div><button type="button" className="st-button is-secondary" onClick={onClose}>Close editor</button></header>
      {navigation}
      <div className={styles.body}><div ref={content} className={styles.content} tabIndex={-1}><div hidden={section==="preview"}>{children}</div><div hidden={section!=="preview"}>{preview}</div></div><aside className={styles.preview} aria-label="Unsaved creation preview">{preview}</aside></div>
      <footer className={styles.footer}>{footer}</footer>
    </div>
  </dialog>;
}
