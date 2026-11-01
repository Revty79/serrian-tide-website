"use client";
import {useEffect,type RefObject} from "react";
/** Fit the map below the settled sticky navigation, including phone keyboards. */
export function useTownViewport(ref:RefObject<HTMLElement|null>,expanded=false) {
 useEffect(()=>{
  const root=ref.current;if(!root)return;
  let frame=0,active=true;
  const navigation=()=>expanded?0:Math.max(80,document.querySelector(".authenticated-navigation")?.getBoundingClientRect().bottom??96);
  const update=()=>{
   const height=window.visualViewport?.height??window.innerHeight,typing=!!document.activeElement?.matches("input,textarea,select"),keyboard=window.innerWidth<=700&&typing&&height<window.innerHeight-100;
   root.dataset.keyboard=keyboard?"1":"0";
   root.style.setProperty("--town-height",Math.max(keyboard?240:500,height-navigation()-(expanded?0:8))+"px");
  };
  if(expanded)root.showPopover();
  const align=(pass=0)=>{
   if(!active)return;
   update();
   if(!expanded){const distance=root.getBoundingClientRect().top-navigation()-8;if(Math.abs(distance)>1)window.scrollTo({top:window.scrollY+distance,behavior:"instant"});}
   // Sticky navigation can move during the first scroll. Re-measure after it settles.
   if(pass<2)frame=requestAnimationFrame(()=>align(pass+1));
  };
  frame=requestAnimationFrame(()=>align());
  window.addEventListener("resize",update);window.visualViewport?.addEventListener("resize",update);document.addEventListener("focusin",update);document.addEventListener("focusout",update);
  return()=>{active=false;cancelAnimationFrame(frame);if(expanded&&root.matches(":popover-open"))root.hidePopover();window.removeEventListener("resize",update);window.visualViewport?.removeEventListener("resize",update);document.removeEventListener("focusin",update);document.removeEventListener("focusout",update);};
 },[ref,expanded]);
}
