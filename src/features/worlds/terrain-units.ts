export const distanceUnits={m:{label:"Metres",symbol:"m",metres:1},km:{label:"Kilometres",symbol:"km",metres:1000},ft:{label:"Feet",symbol:"ft",metres:.3048},yd:{label:"Yards",symbol:"yd",metres:.9144},mi:{label:"Miles",symbol:"mi",metres:1609.344}} as const;
export type DistanceUnit=keyof typeof distanceUnits;
export type DistancePreference=DistanceUnit|"auto-metric"|"auto-imperial";
export type HeightUnit="m"|"ft";
export type MeasurementPreferences={distance:DistancePreference;height:HeightUnit;grid:boolean;gridMode:"auto"|"manual";manualSpacingM:number;snap:boolean};
export const DEFAULT_MEASUREMENT_PREFERENCES:MeasurementPreferences={distance:"auto-metric",height:"m",grid:false,gridMode:"auto",manualSpacingM:100000,snap:false};
export function parseMeasurementPreferences(raw:unknown):MeasurementPreferences|null{
 if(!raw||typeof raw!=="object")return null;const p=raw as MeasurementPreferences;
 if(!["auto-metric","auto-imperial",...Object.keys(distanceUnits)].includes(p.distance)||!["m","ft"].includes(p.height)||typeof p.grid!=="boolean"||typeof p.snap!=="boolean"||!["auto","manual"].includes(p.gridMode)||!Number.isFinite(p.manualSpacingM)||p.manualSpacingM<.001||p.manualSpacingM>1e12)return null;
 return {distance:p.distance,height:p.height,grid:p.grid,gridMode:p.gridMode,manualSpacingM:p.manualSpacingM,snap:p.snap};
}
export function convenientUnit(metres:number,preference:DistancePreference):DistanceUnit{
 if(preference==="auto-metric")return Math.abs(metres)>=1000?"km":"m";
 if(preference==="auto-imperial")return Math.abs(metres)>=1609.344?"mi":Math.abs(metres)>=.9144?"yd":"ft";
 return preference;
}
/** Automatic displays may change units; editable fields use a stable unit. */
export const distanceEditUnit=(p:DistancePreference):DistanceUnit=>p==="auto-metric"?"km":p==="auto-imperial"?"mi":p;
export const toMetres=(value:number,unit:DistanceUnit)=>value*distanceUnits[unit].metres;
export const fromMetres=(value:number,unit:DistanceUnit)=>value/distanceUnits[unit].metres;
export const inputDistance=(metres:number,unit:DistanceUnit)=>Number(fromMetres(metres,unit).toPrecision(12));
/** Coordinate inputs retain the complete double; display-unit changes never round-trip it. */
export const inputCoordinate=(metres:number,unit:DistanceUnit)=>fromMetres(metres,unit);
const number=(value:number,compact=false)=>value.toLocaleString(undefined,{maximumSignificantDigits:compact?5:8,...compact&&Math.abs(value)>=1e9?{notation:"scientific" as const}:{}});
export function formatDistance(metres:number,preference:DistancePreference,unit?:DistanceUnit,compact=false){const u=unit??convenientUnit(metres,preference);return `${number(fromMetres(metres,u),compact)} ${distanceUnits[u].symbol}`;}
/** Useful readout precision relative to a quarter CSS pixel, never stored rounding. */
export function formatViewportDistance(metres:number,preference:DistancePreference,scale:number,unit?:DistanceUnit){const u=unit??convenientUnit(metres,preference),precision=Math.max(0,Math.min(8,Math.ceil(-Math.log10(.25/(scale*distanceUnits[u].metres)))));return `${fromMetres(metres,u).toLocaleString(undefined,{maximumFractionDigits:precision})} ${u}`;}
export function formatArea(squareMetres:number,preference:DistancePreference){const u=convenientUnit(Math.sqrt(Math.abs(squareMetres)),preference);return `${number(squareMetres/distanceUnits[u].metres**2)} ${distanceUnits[u].symbol}\u00b2`;}
export function formatHeight(metres:number,unit:HeightUnit){return `${fromMetres(metres,unit).toLocaleString(undefined,{maximumFractionDigits:unit==="ft"?2:0})} ${unit}`;}
export function formatCoordinate(metres:number,preference:DistancePreference){const unit=convenientUnit(metres,preference);return `${fromMetres(metres,unit).toLocaleString(undefined,{maximumFractionDigits:unit==="km"||unit==="mi"?6:3})} ${unit}`;}
export type TerrainInspection={elevation:number;seaLevel:number;column:number;row:number;x:number;y:number};
export function formatTerrainInspection(value:string|TerrainInspection,p:MeasurementPreferences){return typeof value==="string"?value:`Elevation ${formatHeight(value.elevation,p.height)} \u00b7 ${value.elevation<=value.seaLevel?"water":"land"} \u00b7 sample ${value.column}, ${value.row} \u00b7 east ${formatCoordinate(value.x,p.distance)}, south ${formatCoordinate(value.y,p.distance)}`;}

/** Preserve metre-field validation; only feet entry is rounded to the whole-metre store. */
export function toStoredHeight(value:number,unit:"m"|"ft"){return unit==="m"?value:Math.round(toMetres(value,unit));}
