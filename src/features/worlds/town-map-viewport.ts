"use client";
import {useEffect,type RefObject} from "react";

/** Normalize wheel distances and keep the map position beneath the cursor fixed. */
export function townWheelCamera(camera:{x:number;y:number;z:number},size:{w:number;h:number},frame:{width:number;height:number},cursor:{x:number;y:number},deltaY:number,deltaMode:number) {
 if(!Number.isFinite(deltaY)||deltaY===0)return camera;
 const pixels=deltaY*(deltaMode===1?16:deltaMode===2?Math.max(1,size.h):1);
 // Small trackpad packets accumulate smoothly; a large wheel packet has a bounded step.
 const z=Math.max(.5,Math.min(50,camera.z*Math.exp(Math.max(-.25,Math.min(.25,-pixels*.0015)))));
 if(z===camera.z)return camera;
 const base=Math.min(Math.max(1,size.w-32)/frame.width,Math.max(1,size.h-32)/frame.height),oldScale=Math.max(1e-6,base*camera.z),newScale=Math.max(1e-6,base*z);
 return {x:camera.x+(cursor.x-size.w/2)*(1/oldScale-1/newScale),y:camera.y+(cursor.y-size.h/2)*(1/oldScale-1/newScale),z};
}

/** Fit the map below the settled sticky navigation, including phone keyboards. */
export function useTownViewport(ref:RefObject<HTMLElement|null>,expanded=false,enabled=true) {
 useEffect(()=>{
  const root=ref.current;if(!root||!enabled)return;
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
 },[ref,expanded,enabled]);
}
