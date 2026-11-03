type OrderedFloor={order:number};
export function nextFloorOrder(floors:readonly OrderedFloor[]){return floors.some(f=>f.order===0)?Math.max(0,...floors.map(f=>f.order))+1:0;}
export function floorPositionName(order:number){return order<0?`Basement${order<-1?" "+Math.abs(order):""}`:order===0?"Ground Floor":`Upper Floor${order>1?" "+order:""}`;}
export function floorDisplayName(name:string,order:number){const position=floorPositionName(order);return name===position?name:`${name} · ${position}`;}
/** A deliberate position choice updates generated names, retaining custom names. */
export function changeFloorPosition(current:{name:string;position:number},kind:"basement"|"ground"|"upper",floors:readonly OrderedFloor[]){
 const position=kind==="basement"?Math.min(0,...floors.map(f=>f.order))-1:kind==="ground"?0:Math.max(0,...floors.map(f=>f.order))+1;
 const automatic=current.name===floorPositionName(current.position)||current.position>0&&current.name==="Upper Floor";
 return {position,name:automatic?floorPositionName(position):current.name};
}
