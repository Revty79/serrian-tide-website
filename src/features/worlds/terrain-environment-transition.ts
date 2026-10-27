import {biomeKeys,vegetationKeys,type Biome,type EnvironmentField} from "./terrain-environment";
/** A fixed two-analysis-cell transition for automatic artwork only. Accepted
 * categories stay exact. Manual boundaries are applied after this preparation.
 * RGB, wooded/conifer/tropical fractions, density and land weight: eight floats. */
export function environmentTransitionField(field:EnvironmentField,bytes:Uint8Array,palette:Record<Biome,[number,number,number]>,wrap:boolean){
  const {width,height}=field,size=width*height*8,raw=new Float32Array(size),horizontal=new Float32Array(size),result=new Float32Array(size),weights=[1,4,6,4,1];
  for(let i=0;i<width*height;i++){const k=i*7,o=i*8,biome=biomeKeys[bytes[k+3]],vegetation=vegetationKeys[bytes[k+4]];if(biome==="water")continue;const color=palette[biome];raw[o]=color[0];raw[o+1]=color[1];raw[o+2]=color[2];raw[o+3]=["woodland","deciduous","conifer","tropical","savanna"].includes(vegetation)?1:0;raw[o+4]=vegetation==="conifer"?1:0;raw[o+5]=vegetation==="tropical"?1:0;raw[o+6]=bytes[k+5]/255;raw[o+7]=1;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const out=(y*width+x)*8;for(let delta=-2;delta<=2;delta++){const xx=wrap?((x+delta)%width+width)%width:Math.max(0,Math.min(width-1,x+delta)),input=(y*width+xx)*8,weight=weights[delta+2]/16;for(let c=0;c<8;c++)horizontal[out+c]+=raw[input+c]*weight;}}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const out=(y*width+x)*8;for(let delta=-2;delta<=2;delta++){const yy=Math.max(0,Math.min(height-1,y+delta)),input=(yy*width+x)*8,weight=weights[delta+2]/16;for(let c=0;c<8;c++)result[out+c]+=horizontal[input+c]*weight;}const land=result[out+7];if(land)for(let c=0;c<7;c++)result[out+c]/=land;}
  return result;
}
