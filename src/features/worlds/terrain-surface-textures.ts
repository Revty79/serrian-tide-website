/** Versioned, bundled CC0 artwork. Original file hashes/credits accompany the
 * public assets. Mapping scales and tints are visual design, never height data. */
import type {TerrainSurfaceProfile} from "./terrain-surface-profile";
export const SURFACE_TEXTURES=[
 {id:"rock",metres:64,mean:[130.8995,104.9483,80.3635],tint:[1.04,1.09,1.15]},
 {id:"scree",metres:24,mean:[80.1275,62.2768,43.7657],tint:[1.45,1.55,1.65]},
 {id:"soil",metres:48,mean:[82.9109,73.4817,59.0908],tint:[1.28,1.24,1.18]},
 {id:"grass",metres:64,mean:[109.8743,96.3227,61.8731],tint:[.72,1.08,.70]},
 {id:"sand",metres:48,mean:[124.479,94.0587,55.4874],tint:[1.60,1.66,1.98]},
 {id:"snow",metres:64,mean:[165.1957,165.1019,167.1034],tint:[1.40,1.41,1.42]},
] as const;
export type TextureMip={size:number;pixels:Uint8ClampedArray};
export type SurfaceTexture={diffuse:TextureMip[];normal:TextureMip[]};
export type SurfaceTextureSet={version:1;materials:SurfaceTexture[];bytes:number};
export const MEAN_SURFACE_TEXTURES:SurfaceTextureSet={version:1,materials:SURFACE_TEXTURES.map(()=>({diffuse:[],normal:[]})),bytes:0};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const smooth=(n:number)=>{n=clamp(n,0,1);return n*n*(3-2*n);};
function random(x:number,y:number){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
/** Albedo and normal maps share one bilinear/trilinear footprint. */
function filteredPair(texture:SurfaceTexture,u:number,v:number,lod:number,mean:readonly number[],out:number[],profile?:TerrainSurfaceProfile){
 const timed=profile?.sampling,start=timed?performance.now():0,level=Math.max(0,Math.floor(lod)),fraction=Math.max(0,lod-level),last=texture.diffuse.length-1,fu=u-Math.floor(u),fv=v-Math.floor(v);
 out[0]=mean[0];out[1]=mean[1];out[2]=mean[2];out[3]=out[4]=127.5;out[5]=255;
 for(let l=0;l<2;l++){
  const weight=l?fraction:1-fraction;if(!weight||level+l>=last)continue;
  const mip=texture.diffuse[level+l],normal=texture.normal[level+l],size=mip.size,x=fu*size-.5,y=fv*size-.5,ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,xx=(ix+size)%size,yy=(iy+size)%size,x1=(xx+1)%size,y1=(yy+1)%size,p=mip.pixels,n=normal.pixels,a=(yy*size+xx)*4,b=(yy*size+x1)*4,d=(y1*size+xx)*4,e=(y1*size+x1)*4,wa=(1-tx)*(1-ty),wb=tx*(1-ty),wd=(1-tx)*ty,we=tx*ty;
  for(let c=0;c<3;c++){out[c]+=(p[a+c]*wa+p[b+c]*wb+p[d+c]*wd+p[e+c]*we-mean[c])*weight;out[c+3]+=(n[a+c]*wa+n[b+c]*wb+n[d+c]*wd+n[e+c]*we-(c===2?255:127.5))*weight;}
 }
 if(timed)profile!.record("mip-filter",performance.now()-start);
}
export type SurfaceTextureWork={a:number[];b:number[];sample:number[]};
export const surfaceTextureWork=():SurfaceTextureWork=>({a:[0,0,0,0,0,0],b:[0,0,0,0,0,0],sample:[0,0,0,0,0,0]});
export const SURFACE_MEANS=SURFACE_TEXTURES.map(m=>[m.mean[0]*m.tint[0],m.mean[1]*m.tint[1],m.mean[2]*m.tint[2],0,0,1]);
/** Blend four World-grid patches with stable offsets/quarter rotations. Unlike
 * independently seeded rendering tiles, shared patch edges evaluate identically. */
function patchSample(texture:SurfaceTexture,index:number,x:number,y:number,footprint:number,profile?:TerrainSurfaceProfile,out=[0,0,0,0,0,0],sample=[0,0,0,0,0,0]){
 out.fill(0);const info=SURFACE_TEXTURES[index],scale=info.metres,u=(x*.8+y*.6)/scale,v=(-x*.6+y*.8)/scale,ix=Math.floor(u),iy=Math.floor(v),fu=smooth(u-ix),fv=smooth(v-iy),lod=Math.log2(Math.max(1,footprint*(texture.diffuse[0]?.size??512)/scale));let variance=0;
 if(!texture.diffuse.length||lod>=texture.diffuse.length-1){for(let c=0;c<3;c++)out[c]=info.mean[c];out[5]=1;return out;}
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){const cx=ix+i,cy=iy+j,weight=(i?fu:1-fu)*(j?fv:1-fv);if(weight<1e-8)continue;variance+=weight*weight;const turn=Math.floor(random(cx+41,cy+173)*4),a=turn===0?u:turn===1?-v:turn===2?-u:v,b=turn===0?v:turn===1?u:turn===2?-v:-u,uu=a+random(cx,cy)*17,vv=b+random(cx+917,cy-513)*17;
  filteredPair(texture,uu,vv,lod,info.mean,sample,profile);
  for(let c=0;c<3;c++)out[c]+=(sample[c]-info.mean[c])*weight;
  const nx=(sample[3]-127.5)/127.5,ny=-(sample[4]-127.5)/127.5,nz=(sample[5]-127.5)/127.5,nu=turn===0?nx:turn===1?ny:turn===2?-nx:-ny,nv=turn===0?ny:turn===1?-nx:turn===2?-ny:nx;
  out[3]+=(nu*.8-nv*.6)*weight;out[4]+=(nu*.6+nv*.8)*weight;out[5]+=nz*weight;
 }
 for(let c=0;c<3;c++)out[c]=clamp(info.mean[c]+out[c]/Math.sqrt(Math.max(.25,variance)),0,255);const norm=Math.hypot(out[3],out[4],out[5])||1;for(let c=3;c<6;c++)out[c]/=norm;return out;
}
export function sampleSurfaceTexture(set:SurfaceTextureSet,index:number,x:number,y:number,footprint:number,period:number|null,profile?:TerrainSurfaceProfile,work?:SurfaceTextureWork){
 const texture=set.materials[index];if(period)x=((x%period)+period)%period;const a=patchSample(texture,index,x,y,footprint,profile,work?.a,work?.sample);if(period&&texture.diffuse.length){const t=smooth(x/period);if(t>0){const b=patchSample(texture,index,x-period,y,footprint,profile,work?.b,work?.sample);for(let c=0;c<6;c++)a[c]=a[c]*(1-t)+b[c]*t;}}
 const tint=SURFACE_TEXTURES[index].tint;for(let c=0;c<3;c++)a[c]*=tint[c];return a;
}
