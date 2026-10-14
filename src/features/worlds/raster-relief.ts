import {elevationColor,type RasterGrid,type RasterLevel} from "./raster";
/** Illumination is derived presentation only. Horizontal scales are explicit
 * source metadata; no terrestrial radius/datum is assumed by this function. */
export function reliefPixels(width:number,height:number,p:{grid:RasterGrid;level:RasterLevel;x:number;y:number;values:Float32Array;stride:number;startX:number;startY:number}){
  const {grid,level,y,values,stride,startX,startY}=p,tint=new Uint8Array(width*height*4),shaded=new Uint8Array(width*height*4),valid=(v:number)=>Number.isFinite(v)&&v!==grid.noData,periodic=grid.horizontalScale.latitudeAdjusted&&grid.bounds[2]-grid.bounds[0]===360&&stride===level.width;
  const sample=(a:number,b:number)=>values[Math.max(0,Math.min(values.length/stride-1,b))*stride+(periodic?(a%stride+stride)%stride:Math.max(0,Math.min(stride-1,a)))];
  for(let j=0;j<height;j++){const latitude=grid.bounds[3]-(y*256+j+.5)*level.factor/grid.height*(grid.bounds[3]-grid.bounds[1]),dx=(grid.bounds[2]-grid.bounds[0])*level.factor/grid.width*grid.horizontalScale.x*(grid.horizontalScale.latitudeAdjusted?Math.max(.01,Math.cos(latitude*Math.PI/180)):1),dy=(grid.bounds[3]-grid.bounds[1])*level.factor/grid.height*grid.horizontalScale.y;
    for(let i=0;i<width;i++){const a=startX+i,b=startY+j,value=sample(a,b),offset=(j*width+i)*4;if(!valid(value))continue;const color=elevationColor(value),west=sample(a-1,b),east=sample(a+1,b),north=sample(a,b-1),south=sample(a,b+1),gx=valid(west)&&valid(east)?(east-west)/(2*dx):0,gy=valid(north)&&valid(south)?(south-north)/(2*dy):0;
      // East/north/up normal (-gx,+gy,1) dotted with northwest light.
      const illumination=Math.max(.28,Math.min(1.15,(.7+.5*gx*3+.5*gy*3)/Math.sqrt(1+9*gx*gx+9*gy*gy)+.3));for(let k=0;k<3;k++){tint[offset+k]=color[k];shaded[offset+k]=Math.min(255,Math.round(color[k]*illumination));}tint[offset+3]=shaded[offset+3]=255;
    }
  }return {tint,shaded};
}
