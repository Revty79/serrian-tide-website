"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./creator-workshop.module.css";

/** Only the centre scrolls. The owner holds the draft and controls save boundaries. */
export function CreatorWorkshop({title,introduction,sections,section,onSection,onClose,children,preview,footer}: {
  title:string; introduction:string; sections:{id:string;label:string}[]; section:string;
  onSection:(id:string)=>void; onClose:()=>void;
  children:ReactNode; preview:ReactNode; footer:ReactNode;
}) {
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),id=useId();
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>previous?.focus();},[]);
  useEffect(()=>{content.current?.scrollTo({top:0});},[section]);
  // VisualViewport follows software keyboards without resizing the shared application.
  useEffect(()=>{const viewport=window.visualViewport;const resize=()=>{if(dialog.current&&viewport){const keyboard=viewport.height<window.innerHeight-24;dialog.current.style.maxHeight=`${Math.max(160,viewport.height-16)}px`;dialog.current.style.top=keyboard?`${viewport.offsetTop+8}px`:"";dialog.current.style.bottom=keyboard?"auto":"";if(keyboard)requestAnimationFrame(()=>{if(dialog.current?.contains(document.activeElement))(document.activeElement as HTMLElement)?.scrollIntoView({block:"nearest"});});}};resize();viewport?.addEventListener("resize",resize);return()=>viewport?.removeEventListener("resize",resize);},[]);
  return <dialog ref={dialog} className={styles.window} aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className={styles.layout}>
      <header className={styles.header}><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-intro`}>{introduction}</p></div><button type="button" className="st-button is-secondary" onClick={onClose}>Close editor</button></header>
      <nav className={styles.nav} aria-label="Workshop sections">{sections.map(item=><button key={item.id} type="button" aria-current={section===item.id?"page":undefined} onClick={()=>onSection(item.id)}>{item.label}</button>)}<button type="button" className={styles.previewTab} aria-current={section==="preview"?"page":undefined} onClick={()=>onSection("preview")}>Preview</button></nav>
      <div className={styles.body}><div ref={content} className={styles.content} tabIndex={-1}><div hidden={section==="preview"}>{children}</div><div hidden={section!=="preview"}>{preview}</div></div><aside className={styles.preview} aria-label="Unsaved creation preview">{preview}</aside></div>
      <footer className={styles.footer}>{footer}</footer>
    </div>
  </dialog>;
}
