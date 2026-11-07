/** Same-World map navigation retains the tab's in-memory editing fence. */
export function nativeMapNavigationDestination(currentHref:string,input:string){
 const current=new URL(currentHref),next=new URL(input,current);
 return {href:next.href,path:next.pathname+next.search+next.hash,retainEditor:next.origin===current.origin&&next.pathname===current.pathname&&/^\/worlds\/[a-f0-9-]{36}$/i.test(current.pathname)};
}
export function navigateNativeMap(input:string){
 const next=nativeMapNavigationDestination(location.href,input);
 if(!next.retainEditor){location.assign(next.href);return;}
 if(next.href===location.href)return;
 window.history.pushState(null,"",next.path);
 window.dispatchEvent(new CustomEvent("atlas:navigate",{detail:{reopenMap:true}}));
}
