import type {TerrainSurfaceProfile} from "./terrain-surface-profile";
import type {SurfaceField} from "./terrain-surface-field";
import {sampleSurfaceTexture,SURFACE_MEANS,type SurfaceTextureWork,type SurfaceTextureSet} from "./terrain-surface-textures";
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function surfaceLightingScale(relief:number,footprint:number){const t=clamp(Math.log2(Math.max(64,footprint)/64)/8,0,1),macro=t*t*(3-2*t);return Math.sqrt(relief)*.35*(1+Math.min(10000,footprint/8)*macro);}
/** Scanned albedo plus texture normals under the saved terrain's illumination.
 * Neither material normals nor decorative grain become numerical elevations. */
export function shadeSurfaceTextures(set:SurfaceTextureSet,field:SurfaceField,weights:number[],x:number,y:number,footprint:number,relief:number,period:number|null,broad:number,water:number[],landFraction:number,profile?:TerrainSurfaceProfile,work?:SurfaceTextureWork,out:[number,number,number]=[0,0,0],lightingScale=surfaceLightingScale(relief,footprint),texture=1):[number,number,number]{
 const albedo=out;albedo[0]=albedo[1]=albedo[2]=0;let microX=0,microY=0,first=0,second=1;
 for(let i=1;i<6;i++)if(weights[i]>weights[first])first=i;second=first===0?1:0;for(let i=0;i<6;i++)if(i!==first&&weights[i]>weights[second])second=i;
 let third=0;for(let i=0;i<6;i++)if(i!==first&&i!==second)third=Math.max(third,weights[i]);
 for(let i=0;i<6;i++){if(weights[i]<1e-5)continue;// Lesser contributions retain their filtered material mean; the two dominant
 // materials provide photographic detail and normals without multiplying CPU cost.
 // Detail fades to the mean at rank ties, so changing slope never creates a seam.
 const timed=profile?.sampling,start=timed?performance.now():0;const amount=clamp((weights[i]-third)/.08,0,1),fade=amount*amount*(3-2*amount),mean=SURFACE_MEANS[i],t=(i===first||i===second)&&fade?sampleSurfaceTexture(set,i,x,y,footprint,period,profile,work):mean;if(timed)profile!.record("texture",performance.now()-start);if(t!==mean&&fade<1)for(let c=0;c<6;c++)t[c]=mean[c]+(t[c]-mean[c])*fade;for(let c=0;c<3;c++)albedo[c]+=(texture===1?t[c]:mean[c]+(t[c]-mean[c])*texture)*weights[i];const strength=(i===0?.30:i===1?.20:i===5?.07:.10)*texture,nz=Math.max(.3,t[5]);microX+=-t[3]/nz*strength*weights[i];microY+=-t[4]/nz*strength*weights[i]*texture;}
 const timed=profile?.sampling,start=timed?performance.now():0;const intensity=lightingScale,gx=Math.atan(field.gx*intensity)+microX,gy=Math.atan(field.gy*intensity)+microY,light=clamp((.82-.48*gx-.35*gy)/Math.hypot(gx,gy,1),.10,1.28),ambient=(.46+light*.64)*(1-Math.min(.12,field.rough*.08))*(1+(broad-.5)*.48*texture);
 for(let i=0;i<3;i++)out[i]=clamp(albedo[i]*ambient,0,255)*landFraction+water[i]*(1-landFraction);const result=out;if(timed)profile!.record("lighting",performance.now()-start);return result;
}
