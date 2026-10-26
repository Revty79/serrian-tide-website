/** Versioned, bundled CC0 artwork. Original file hashes/credits accompany the
 * public assets. Mapping scales and tints are visual design, never height data. */
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
/** Filter RGB together so coordinate/texel work is shared across channels. */
function filteredRGB(mips:TextureMip[],u:number,v:number,lod:number,mean:readonly number[],out:number[],offset:number){
 const level=Math.max(0,Math.floor(lod)),fraction=Math.max(0,lod-level),last=mips.length-1;
 for(let c=0;c<3;c++)out[offset+c]=mean[c];
 if(level>=last)return;
 for(let l=0;l<2;l++){
  const weight=l?fraction:1-fraction;if(!weight||level+l>=last)continue;
  const mip=mips[level+l],size=mip.size,x=(u-Math.floor(u))*size-.5,y=(v-Math.floor(v))*size-.5,ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,xx=(ix+size)%size,yy=(iy+size)%size,x1=(xx+1)%size,y1=(yy+1)%size,p=mip.pixels,a=(yy*size+xx)*4,b=(yy*size+x1)*4,d=(y1*size+xx)*4,e=(y1*size+x1)*4,wa=(1-tx)*(1-ty),wb=tx*(1-ty),wd=(1-tx)*ty,we=tx*ty;
  for(let c=0;c<3;c++)out[offset+c]+=(p[a+c]*wa+p[b+c]*wb+p[d+c]*wd+p[e+c]*we-mean[c])*weight;
 }
}
const NORMAL_MEAN=[127.5,127.5,255] as const;
/** Blend four World-grid patches with stable offsets/quarter rotations. Unlike
 * independently seeded rendering tiles, shared patch edges evaluate identically. */
function patchSample(texture:SurfaceTexture,index:number,x:number,y:number,footprint:number){
 const info=SURFACE_TEXTURES[index],scale=info.metres,u=(x*.8+y*.6)/scale,v=(-x*.6+y*.8)/scale,ix=Math.floor(u),iy=Math.floor(v),fu=smooth(u-ix),fv=smooth(v-iy),lod=Math.log2(Math.max(1,footprint*(texture.diffuse[0]?.size??512)/scale)),out=[0,0,0,0,0,0],sample=[0,0,0,0,0,0];let variance=0;
 if(!texture.diffuse.length||lod>=texture.diffuse.length-1){for(let c=0;c<3;c++)out[c]=info.mean[c];out[5]=1;return out;}
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){const cx=ix+i,cy=iy+j,weight=(i?fu:1-fu)*(j?fv:1-fv);if(weight<1e-8)continue;variance+=weight*weight;const turn=Math.floor(random(cx+41,cy+173)*4),a=turn===0?u:turn===1?-v:turn===2?-u:v,b=turn===0?v:turn===1?u:turn===2?-v:-u,uu=a+random(cx,cy)*17,vv=b+random(cx+917,cy-513)*17;
  filteredRGB(texture.diffuse,uu,vv,lod,info.mean,sample,0);filteredRGB(texture.normal,uu,vv,lod,NORMAL_MEAN,sample,3);
  for(let c=0;c<3;c++)out[c]+=(sample[c]-info.mean[c])*weight;
  const nx=(sample[3]-127.5)/127.5,ny=-(sample[4]-127.5)/127.5,nz=(sample[5]-127.5)/127.5,nu=turn===0?nx:turn===1?ny:turn===2?-nx:-ny,nv=turn===0?ny:turn===1?-nx:turn===2?-ny:nx;
  out[3]+=(nu*.8-nv*.6)*weight;out[4]+=(nu*.6+nv*.8)*weight;out[5]+=nz*weight;
 }
 for(let c=0;c<3;c++)out[c]=clamp(info.mean[c]+out[c]/Math.sqrt(Math.max(.25,variance)),0,255);const norm=Math.hypot(out[3],out[4],out[5])||1;for(let c=3;c<6;c++)out[c]/=norm;return out;
}
export function sampleSurfaceTexture(set:SurfaceTextureSet,index:number,x:number,y:number,footprint:number,period:number|null){
 const texture=set.materials[index];if(period)x=((x%period)+period)%period;const a=patchSample(texture,index,x,y,footprint);if(period&&texture.diffuse.length){const t=smooth(x/period);if(t>0){const b=patchSample(texture,index,x-period,y,footprint);for(let c=0;c<6;c++)a[c]=a[c]*(1-t)+b[c]*t;}}
 const tint=SURFACE_TEXTURES[index].tint;for(let c=0;c<3;c++)a[c]*=tint[c];return a;
}
