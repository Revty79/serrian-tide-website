export function physicalSeed(seed:string){let h=2166136261;for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);return h>>>0;}
export function physicalRandom(x:number,y:number,seed:number){let v=Math.imul(x,374761393)+Math.imul(y,668265263)+seed;v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295;}
export const smooth01=(value:number)=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};
const fade=(v:number)=>v*v*v*(v*(v*6-15)+10),gradients=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];
/** Equal kilometre axes. Wrapped X uses an integer number of periods. */
export function physicalNoise(x:number,y:number,scaleKm:number,seed:number,wrapWidthKm=0){
 const periods=wrapWidthKm?Math.max(1,Math.round(wrapWidthKm/scaleKm)):0,px=periods?x/wrapWidthKm*periods:x/scaleKm,py=y/scaleKm,ix=Math.floor(px),iy=Math.floor(py),a=fade(px-ix),b=fade(py-iy);
 const at=(xx:number,yy:number)=>{const g=gradients[Math.floor(physicalRandom(periods?(xx%periods+periods)%periods:xx,yy,seed)*8)%8];return g[0]*(px-xx)+g[1]*(py-yy);};
 return (at(ix,iy)*(1-a)*(1-b)+at(ix+1,iy)*a*(1-b)+at(ix,iy+1)*(1-a)*b+at(ix+1,iy+1)*a*b)*1.4;
}
export function physicalFractal(x:number,y:number,scale:number,seed:number,wrapWidth=0){return (physicalNoise(x,y,scale,seed,wrapWidth)+physicalNoise(x,y,scale/2,seed+1103,wrapWidth)*.5+physicalNoise(x,y,scale/4,seed+2206,wrapWidth)*.25)/1.75;}
export const wrappedDistance=(x:number,center:number,width:number)=>width?((x-center+width/2)%width+width)%width-width/2:x-center;
