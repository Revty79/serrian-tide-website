import {floorRound,roomFeatures,validateFloor,type FloorDesign,type FloorFeature,type FloorFrame} from "./building-floor";
import {alignedFloorPoint,buildingFloorAlignment,initialBuildingFloor,sourceFloorFeature} from "./building-floor-alignment";
import {regionAreaContainsPath,type RegionArea} from "./terrain-region-geometry";
import type {TownPoint} from "./town-map";
const roomNames:Record<string,string[]>={house:["Living room","Kitchen","Bedroom"],inn:["Tavern room","Kitchen","Store","Guest room","Guest room"],shop:["Showroom","Workshop","Stock room"],temple:["Sanctuary","Vestry","Store"],warehouse:["Office","Secure store"],manor:["Parlour","Dining room","Kitchen","Study","Bedroom"],barracks:["Bunk room","Armoury","Guard room","Stores"],modern:["Office","Meeting room","Services","Workshop"]};
const symbols:Record<string,string[]>={house:["table","stove","bed"],inn:["table","stove","barrel","bed"],shop:["counter","workbench","shelf"],temple:["column","cabinet","shelf"],warehouse:["desk","shelf"],manor:["table","chair","stove","desk","bed"],barracks:["bed","cabinet","desk","chest"],modern:["desk","table","cabinet","workbench"]};
/** Orchestrates native room/wall/opening builders in the accepted building-aligned grid. */
export function interiorTemplateLayout(purpose:string,count:number,footprint:TownPoint[],frame:FloorFrame,newId:()=>string):FloorDesign{
 const alignment=buildingFloorAlignment(footprint,frame),ps=footprint.map(p=>alignedFloorPoint(p,alignment)),bounds={x:Math.min(...ps.map(p=>p.x)),y:Math.min(...ps.map(p=>p.y)),width:Math.max(...ps.map(p=>p.x))-Math.min(...ps.map(p=>p.x)),height:Math.max(...ps.map(p=>p.y))-Math.min(...ps.map(p=>p.y))},world={width:alignment.frame.width,height:alignment.frame.height,wrap:false},area:RegionArea={frame:{x:0,y:0,...world},footprint:{version:1,kind:"polygon",parts:[ps]}},fits=(points:TownPoint[])=>regionAreaContainsPath(area,points,world,.25,true),local:FloorFeature[]=[],base=initialBuildingFloor("outline",footprint,frame,newId);
 let rooms=0;
 for(let i=0;i<count;i++){
  const right=i%2===1,rows=Math.ceil((count-(right?1:0))/2),row=Math.floor(i/2),cx=bounds.x+bounds.width*(right?.78:.22),cy=bounds.y+bounds.height*(row+.5)/rows;
  let width=bounds.width*.32,height=bounds.height/rows-.8,points:TownPoint[]=[];
  for(let attempt=0;attempt<12;attempt++){points=[{x:cx-width/2,y:cy-height/2},{x:cx+width/2,y:cy-height/2},{x:cx+width/2,y:cy+height/2},{x:cx-width/2,y:cy+height/2}].map(p=>({x:floorRound(p.x),y:floorRound(p.y)}));if(width>=2&&height>=2&&fits(points))break;width*=.87;height*=.94;}
  if(width<2||height<2||!fits(points))continue;
  const pieces=roomFeatures(points,newId),room=pieces[0],wall=pieces[1];if(wall.variant!=="wall")throw Error("Native room wall missing.");
  const title=(roomNames[purpose]?.[i%roomNames[purpose].length]??"Room")+(i>=4?" "+(i+1):"");room.name=title;wall.name=title+" walls";local.push(...pieces);const door=newId(),a=right?3:1,b=a+1;
  local.push({version:1,id:door,entityId:door,variant:"opening",kind:"opening",name:title+" doorway",archived:false,wallId:wall.id,startId:wall.points[a].id,endId:wall.points[b].id,at:.5,width:floorRound(Math.min(1.2,height*.28)),style:purpose==="temple"?"arch":"door"});
  const object=newId(),symbol=symbols[purpose]?.[i%symbols[purpose].length]??"table";local.push({version:1,id:object,entityId:object,variant:"object",kind:"furnishing",name:title+" "+symbol,archived:false,point:{x:floorRound(cx),y:floorRound(cy)},width:floorRound(Math.min(1.5,width*.55)),height:floorRound(Math.min(1.4,height*.5)),rotation:0,symbol,destination:null});rooms++;
 }
 if(rooms<Math.min(2,count))return initialBuildingFloor("generate",footprint,frame,newId,count);
 const hallway=[{x:bounds.x+bounds.width*.43,y:bounds.y+.5},{x:bounds.x+bounds.width*.57,y:bounds.y+.5},{x:bounds.x+bounds.width*.57,y:bounds.y+bounds.height-.5},{x:bounds.x+bounds.width*.43,y:bounds.y+bounds.height-.5}].map(p=>({x:floorRound(p.x),y:floorRound(p.y)}));
 if(fits(hallway)){const hall=roomFeatures(hallway,newId)[0];hall.name=purpose==="temple"?"Open nave":purpose==="warehouse"?"Storage aisle":"Open hallway";local.unshift(hall);}
 const design={...base,features:[...base.features,...local.map(f=>sourceFloorFeature(f,alignment))]};validateFloor(design,frame);return design;
}
