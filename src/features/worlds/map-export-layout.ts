export const EXPORT_WIDTH=2000,EXPORT_MAP_HEIGHT=1200,EXPORT_SVG_BYTES=12_000_000;
/** Credits are never silently truncated. Large source lists require a smaller view. */
export function mapExportLayout(credits:string[]){
 const lines:string[]=[];
 for(const credit of [...new Set(credits.filter(Boolean))]){let line="";for(const word of credit.replace(/\s+/g," ").trim().match(/\S{1,80}/g)??[]){if(line.length+word.length>90){lines.push(line);line="";}line+=(line?" ":"")+word;}if(line)lines.push(line);}
 if(lines.length>24)throw new Error("This view has more source credit than fits in one bounded export. Choose a smaller region or export authored artwork.");
 const footer=lines.length?32+lines.length*26:0,height=EXPORT_MAP_HEIGHT+footer;
 return {lines,width:EXPORT_WIDTH,mapHeight:EXPORT_MAP_HEIGHT,height,pixelBytes:EXPORT_WIDTH*height*4,svgRasterBytes:EXPORT_WIDTH*EXPORT_MAP_HEIGHT*4};
}
