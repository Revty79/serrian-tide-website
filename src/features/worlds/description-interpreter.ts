import { generationSpecSchema, presetSpec, type GenerationPlan, type GenerationSettings, type GenerationSpec, type Region } from "./generation-spec";

export const descriptionExample = "Create one large continent in the northern part of the map. Its western coast is jagged, with several deep bays. A mountain range runs north to south through its center. Dense forests cover the southern regions, and three islands lie off the eastern shore. A large river flows from the mountains toward the eastern bay.";
const counts: Record<string, number> = {no:0,zero:0,a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,several:3,many:24};
const numberWords = Object.keys(counts).join("|");
const feature = /\b(continents?|landmasses?|islands?|archipelagos?|coastlines?|coasts?|bays?|inlets?|mountains?|ranges?|forests?|woodlands?|rainforests?|rivers?|streams?|lakes?|deserts?|grasslands?|plains?|wetlands?|swamps?|snow|tundra|hills?|valleys?)\b/;
const modifiers = "large|small|medium|major|main|tiny|huge|dense|sparse|deep|shallow|jagged|rugged|smooth|northern|southern|eastern|western";
const subjectStart = `(?:(?:${numberWords}|\\d+|${modifiers})\\s+){0,4}(?:continents?|landmasses?|islands?|forests?|woodlands?|rainforests?|rivers?|streams?|lakes?|deserts?|grasslands?|wetlands?|hills?|valleys?|mountain ranges?)\\b`;
const vocabulary = new Set((`create make draw generate place add include with without no not none zero a an one two three four five six seven eight nine ten eleven twelve several many some the this that it its their them our map world overview part parts portion portions region regions area areas side sides shore shores shoreline shorelines coast coasts coastline coastlines bay bays inlet inlets continent continents landmass landmasses island islands archipelago archipelagos offshore off from toward towards to into in on at through along across around lies lie located sits runs run running covers cover covered covering flows flow flowing extends extend stretching stretching between and or of is are be should has have there also then mostly approximately about roughly very relatively highly all only central center centre middle interior northern north northward northwards southern south southward southwards eastern east eastward eastwards western west westward westwards northeast northeastern northwest northwestern southeast southeastern southwest southwestern large small medium varied tiny huge major main size sizes shape shapes balanced elongated crescent jagged rugged rocky irregular smooth deep shallow dense sparse wooded forest forests woodland woodlands rainforest rainforests tree trees mountain mountains range ranges peak peaks ridge ridges river rivers stream streams lake lakes desert deserts grassland grasslands plains wetland wetlands swamp swamps snow snowy tundra frozen icy cold cool temperate warm hot arid dry tropical mixed climate climates biome biomes terrain hilly hill hills valley valleys parchment illuminated night style appearance winds winds winding bends bend north-south east-west northeast-southwest northwest-southeast`).split(/\s+/));
const orientationPattern = /\b(north(?:ern)?\s*(?:to|[-–])\s*south(?:ern)?|south(?:ern)?\s*(?:to|[-–])\s*north(?:ern)?|east(?:ern)?\s*(?:to|[-–])\s*west(?:ern)?|west(?:ern)?\s*(?:to|[-–])\s*east(?:ern)?|north(?:\s*[-–]?\s*)east\s*(?:to|[-–])\s*south(?:\s*[-–]?\s*)west|north(?:\s*[-–]?\s*)west\s*(?:to|[-–])\s*south(?:\s*[-–]?\s*)east)\b/g;

/** A bounded English vocabulary interpreter. No private text leaves the application. */
export function interpretDescription(raw: string, base: GenerationSpec): GenerationSpec {
  const description=raw.trim();
  if(!description||description.length>4000)throw new Error("Write a geography description of 1 to 4000 characters.");
  if(/\b(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred|thousand)\b/i.test(description))throw new Error("Use digits for counts above twelve, such as 28 islands. Written compound numbers are not supported.");
  if(/(?:-\d+|\d+[.,]\d+)\s+(?:\w+\s+){0,3}(?:continents?|landmasses?|islands?|rivers?|streams?|lakes?|bays?|ranges?)\b/i.test(description))throw new Error("Geography counts must be nonnegative whole numbers.");
  const input=generationSpecSchema.parse(base),spec=presetSpec("continental",input.seed),understood:string[]=[],warnings:string[]=[],writes=new Map<string,string>();
  spec.algorithm=input.algorithm;
  spec.settings={...spec.settings,mapType:"continent",continents:1,islands:0,size:"large",shape:"balanced",rivers:1,lakes:0,biome:"temperate",style:input.settings.style};
  spec.description=description;
  const clauses=description.toLowerCase().split(/[.!?;\n]+/).flatMap(s=>s.split(new RegExp(`,\\s*(?:and\\s+)?|\\s+and\\s+(?=${subjectStart})`))).map(s=>s.trim()).filter(Boolean);
  if(clauses.length>48)throw new Error("Use at most 48 short geography clauses. Split longer designs into separate maps.");
  let coastContext: "north"|"south"|"east"|"west"|"all"="all";
  const warn=(message:string)=>{if(!warnings.includes(message))warnings.push(message);};
  const record=(key:string,value:unknown)=>{const encoded=JSON.stringify(value),old=writes.get(key);if(old!==undefined&&old!==encoded)warn(`Conflicting instructions for ${key}: ${old} and ${encoded}. The later instruction is shown in the plan; revise the description if needed.`);writes.set(key,encoded);};
  const setting=<K extends keyof GenerationSettings>(key:K,value:GenerationSettings[K])=>{record(key,value);spec.settings[key]=value;};
  const plan=<K extends keyof GenerationPlan>(key:K,value:GenerationPlan[K])=>{record(key,value);spec.plan[key]=value;};
  const count=(clause:string,noun:string,max:number):number|null=>{
    const match=clause.match(new RegExp(`\\b(${numberWords}|\\d+)\\s+(?:(?:${modifiers})\\s+){0,4}(?:${noun})\\b`));
    if(/\bwithout\b/.test(clause))return 0;
    if(!match)return null;
    const value=counts[match[1]]??Number(match[1]);
    if(value>max)throw new Error(`This description requests ${value} ${noun.replace(/\W/g," ")}. The supported maximum is ${max}; reduce the count before interpreting again.`);
    return value;
  };
  const region=(clause:string):Region|null=>{
    const text=clause.replace(orientationPattern,"").replace(/north\s*[-–]\s*east/g,"northeast").replace(/north\s*[-–]\s*west/g,"northwest").replace(/south\s*[-–]\s*east/g,"southeast").replace(/south\s*[-–]\s*west/g,"southwest");
    const matches=text.match(/\b(northeast(?:ern)?|northwest(?:ern)?|southeast(?:ern)?|southwest(?:ern)?|north(?:ern|wards?)?|south(?:ern|wards?)?|east(?:ern|wards?)?|west(?:ern|wards?)?|center|centre|central|middle)\b/g)??[];
    const north=matches.some(v=>v.startsWith("north")),south=matches.some(v=>v.startsWith("south")),east=matches.some(v=>v.includes("east")),west=matches.some(v=>v.includes("west"));
    if(north&&south||east&&west){warn(`More than one opposite region was requested in “${clause.slice(0,100)}”. Use a single region for each feature group.`);return null;}
    if(north||south||east||west)return `${north?"north":south?"south":""}${east?"east":west?"west":""}` as Region;
    return matches.length?"center":null;
  };
  const cardinal=(r:Region|null,context:string)=>{if(r===null)return null;if(r==="north"||r==="south"||r==="east"||r==="west")return r;warn(`${context} supports north, south, east or west. “${r}” is not an outlet/coast side; the retained value is shown in the plan.`);return null;};
  const terrain=(kind:GenerationPlan["extraTerrain"][number])=>{if(!spec.plan.extraTerrain.includes(kind))spec.plan.extraTerrain.push(kind);};

  for(const clause of clauses){
    const subject=clause.match(feature)?.[1]??"",notes:string[]=[];
    if(/\bnot\b/.test(clause)){warn(`Negation in “${clause.slice(0,100)}” is ambiguous. Use “no forests”, “zero islands” or a positive instruction; this clause was not applied.`);continue;}
    if(/^(continent|landmass)/.test(subject)){
      const n=count(clause,"continents?|landmasses?",6);if(n!==null)setting("continents",n);else if(/\b(continent|landmass)\b/.test(clause))setting("continents",1);else warn("A continent count was not specified; the current count is retained.");
      spec.settings.mapType=spec.settings.continents===1?"continent":"world";
      const size=clause.match(/\b(large|small|medium|varied|tiny|huge)\b/)?.[1];if(size){setting("size",size==="tiny"?"small":size==="huge"?"large":size as GenerationSettings["size"]);if(size==="tiny"||size==="huge")warn(`“${size}” uses the bounded ${spec.settings.size} landmass-size setting.`);}
      const shape=clause.match(/\b(balanced|elongated|crescent|varied)\b/)?.[1];if(shape)setting("shape",shape as GenerationSettings["shape"]);
      const r=region(clause.split(/\bwith\b/)[0]);if(r){if(spec.settings.continents===1)plan("landPosition",r);else{plan("landPosition","center");warn("Directional main-continent placement supports one major continent. Several continents retain separated automatic placement.");}}
      if(spec.settings.continents!==1)spec.plan.landPosition="center";
      notes.push(`${spec.settings.continents} major landmass(es), ${spec.settings.size}, ${spec.settings.shape}, placement ${spec.plan.landPosition}.`);
    }else if(/^(island|archipelago)/.test(subject)){
      const n=count(clause,"islands?",32);if(n!==null)setting("islands",n);else if(subject.startsWith("archipelago")){setting("continents",0);spec.settings.mapType="world";spec.plan.landPosition="center";setting("islands",24);}else if(subject==="island")setting("islands",1);else warn("An island count was not specified; the current count is retained.");
      const r=region(clause);if(r)plan("islandPosition",r);
      const size=clause.match(/\b(small|medium|large|varied)\b/)?.[1];if(size){if(!spec.settings.continents)setting("size",size as GenerationSettings["size"]);else warn("Independent offshore-island sizing is not interpreted. Island sizes vary within the plan; resize individual islands in the editor.");}
      notes.push(`${spec.settings.islands} offshore islands, placement ${spec.plan.islandPosition}.`);
    }else if(/^(coast|bay|inlet)/.test(subject)){
      const r=region(clause),side=r?cardinal(r,"Coast placement"):null;if(side)coastContext=side;
      if(/\b(jagged|rugged|rocky|irregular|smooth)\b/.test(clause)){setting("ruggedness",/\bsmooth\b/.test(clause)?15:88);plan("ruggedCoast",side??coastContext);notes.push(`${spec.plan.ruggedCoast} coast ruggedness ${spec.settings.ruggedness}%.`);}
      if(/\b(bays?|inlets?)\b/.test(clause)){const n=count(clause,"bays?|inlets?",4);plan("bays",n??(/\b(bay|inlet)\b/.test(clause)?1:3));plan("baySide",side??coastContext);if(/\bdeep\b/.test(clause))plan("bayDepth",3);if(/\bshallow\b/.test(clause))plan("bayDepth",1);notes.push(`${spec.plan.bays} bays per continent, ${spec.plan.baySide} coast, depth ${spec.plan.bayDepth}.`);}
      if(!notes.length)warn(`No supported coastline instruction was found in “${clause.slice(0,100)}”.`);
    }else if(/^(mountain|range)/.test(subject)){
      const n=count(clause,"mountain ranges?|ranges?",3);if(n===0||/\b(no|zero|without)\b/.test(clause))setting("mountains",0);else{setting("mountains",/\b(sparse|small)\b/.test(clause)?35:/\b(dense|rugged|large)\b/.test(clause)?85:65);if(n!==null)plan("mountainRanges",n);}
      const orientation=clause.match(orientationPattern)?.[0];if(orientation){const flat=orientation.replace(/ern|\s|to|[-–]/g,"");plan("mountainOrientation",flat.includes("northeast")?"northeast-southwest":flat.includes("northwest")?"northwest-southeast":flat.includes("north")||flat.includes("south")?"north-south":"east-west");}
      const r=region(clause);if(r)plan("mountainRegion",r);
      if(/\b(large|small|huge|tiny)\b/.test(clause))warn("Relative range length or peak height is not interpreted. Mountain density controls illustrated peaks; reshape the range in the editor.");
      notes.push(`Mountains ${spec.settings.mountains}%, ${spec.plan.mountainRanges} range(s) per continent, ${spec.plan.mountainRegion}, ${spec.plan.mountainOrientation}.`);
    }else if(/^(forest|woodland|rainforest)/.test(subject)){
      setting("forest",/\b(no|zero|without)\b/.test(clause)?0:/\bsparse\b/.test(clause)?30:/\bdense\b/.test(clause)?85:65);const r=region(clause);if(r)plan("forestRegion",r);if(subject.startsWith("rainforest"))setting("biome","tropical");notes.push(`Woodlands ${spec.settings.forest}% tendency, ${spec.plan.forestRegion}.`);
    }else if(/^(river|stream)/.test(subject)){
      const n=count(clause,"rivers?|streams?",12);if(n!==null)setting("rivers",n);else if(/\b(river|stream)\b/.test(clause))setting("rivers",1);else warn("A river count was not specified; the current count is retained.");
      const destinations=clause.split(/\b(?:towards?|to|into)\b/),destination=destinations.length>1?destinations.at(-1)!:/\bfrom\b/.test(clause)?"":clause,r=region(destination),side=cardinal(r,"River outlet");if(side)plan("riverDirection",side);
      if(/\b(lakes?)\b/.test(destination))warn("Lake-fed river destinations are not interpreted. Rivers reach a real coastline in the shown outlet direction.");
      if(/\b(bay|inlet)\b/.test(destination)&&side){if(spec.plan.baySide===side||spec.plan.baySide==="all"){plan("baySide",side);if(!spec.plan.bays)plan("bays",1);}else plan("additionalBaySide",side);}
      if(/\b(large|small|wide|narrow)\b/.test(clause))warn("Relative river width is not interpreted; the starting river/stream widths can be changed in the editor.");
      if(/\bfrom\b/.test(clause)&&!/\b(mountains?|ranges?|interior|center|centre|middle)\b/.test(clause))warn("River sources use mountain flanks or the interior. The requested source location is not interpreted.");
      if(/\bfrom\b/.test(clause)&&region(clause.split(/\b(?:towards?|to|into)\b/)[0]))warn("Directional river-source placement is not interpreted. Sources use the generated mountain flanks/interior; outlet direction is supported.");
      if(subject.startsWith("stream"))warn("Stream-only styling is not interpreted. Generated routes mix rivers and streams; change an individual path kind in the editor.");
      notes.push(`${spec.settings.rivers} river/stream route(s) from mountain flanks or the interior to the ${spec.plan.riverDirection} coast.`);
    }else if(/^lake/.test(subject)){
      const n=count(clause,"lakes?",10);if(n!==null)setting("lakes",n);else if(subject==="lake")setting("lakes",1);else warn("A lake count was not specified; the current count is retained.");const r=region(clause);if(r)plan("lakeRegion",r);if(/\b(large|small)\b/.test(clause))warn("Relative lake size is not interpreted; lake brush radius remains editable.");notes.push(`${spec.settings.lakes} inland lake group(s), ${spec.plan.lakeRegion}.`);
    }else if(subject){
      const kind:GenerationPlan["extraTerrain"][number]=subject.startsWith("desert")?"desert":/^(grassland|plain)/.test(subject)?"grassland":/^(wetland|swamp)/.test(subject)?"wetland":/^(snow|tundra)/.test(subject)?"snow":subject.startsWith("hill")?"hills":"valleys";
      if(/\b(no|zero|without)\b/.test(clause))warn(`Removing ${kind} from the underlying biome is not supported by descriptions. Choose a different terrain tendency in settings.`);
      else{terrain(kind);const r=region(clause);if(r&&kind==="desert")plan("desertRegion",r);if(r&&kind==="grassland")plan("grasslandRegion",r);if(r&&kind==="wetland")plan("wetlandRegion",r);if(r&&kind==="snow")plan("snowRegion",r);const automatic=kind==="hills"||kind==="valleys";if(r&&automatic)warn(`${kind} use broad automatic terrain placement; their individual region is not interpreted.`);notes.push(`Additional ${kind} terrain${r&&!automatic?` in ${r}`:" in automatic regions"}.`);}
    }
    if(/\b(cold|frozen|icy|cool|temperate|arid|dry|tropical|mixed)\b/.test(clause)){
      const biome:GenerationSettings["biome"]=/\b(cold|frozen|icy|cool)\b/.test(clause)?"northern":/\b(arid|dry)\b/.test(clause)?"arid":/\btropical\b/.test(clause)?"tropical":/\bmixed\b/.test(clause)?"mixed":"temperate";setting("biome",biome);notes.push(`${biome} terrain tendency.`);
    }
    const style=clause.match(/\b(parchment|illuminated|night)\b/)?.[1];if(style){setting("style",style as GenerationSettings["style"]);notes.push(`${style} appearance.`);}
    if(/\b(warm|hot)\b/.test(clause))warn("Warm/hot climate alone is ambiguous. Use tropical or arid for the supported illustrated terrain tendency.");
    const category=(word:string)=>/^(continent|landmass)/.test(word)?"land":/^(island|archipelago)/.test(word)?"islands":/^(coast|bay|inlet)/.test(word)?"coast":/^(mountain|range)/.test(word)?"mountains":/^(forest|woodland|rainforest)/.test(word)?"forest":/^(river|stream)/.test(word)?"river":word.replace(/s$/,""),primary=category(subject);
    const secondary=[...new Set((clause.match(new RegExp(feature.source,"g"))??[]).map(category))].filter(c=>c!==primary&&!(primary==="river"&&["mountains","coast","lake"].includes(c)));
    if(secondary.length)warn(`Additional feature instructions in “${clause.slice(0,100)}” were not applied: ${secondary.join(", ")}. Put each feature in a separate sentence or comma-separated clause.`);
    if(!notes.length)warn(`Not interpreted: “${clause.slice(0,120)}”. Use the supported geography vocabulary or add this manually after generation.`);
    const unknown=[...new Set(clause.match(/[a-z]+(?:-[a-z]+)*/g)??[])].filter(w=>!vocabulary.has(w));
    if(unknown.length)warn(`Unsupported words in “${clause.slice(0,100)}”: ${unknown.join(", ").slice(0,160)}. These details are not promised by the plan.`);
    if(notes.length)understood.push(notes.join(" "));
  }
  if(!understood.length)throw new Error("No supported geography instructions were found. Try the example or choose generation settings.");
  if(warnings.length>48)throw new Error("Too many unsupported or conflicting instructions. Shorten the description and use the documented vocabulary.");
  spec.interpretation={version:1,understood,warnings};
  return generationSpecSchema.parse(spec);
}

export function validateDescriptionSpec(spec:GenerationSpec):void{
  if(spec.description===null)return;
  const checked=interpretDescription(spec.description,spec);
  if(JSON.stringify(checked)!==JSON.stringify(generationSpecSchema.parse(spec)))throw new Error("The description and interpreted plan do not match. Interpret the description again before previewing and saving.");
}
