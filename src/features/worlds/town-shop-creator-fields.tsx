"use client";
import {Field} from "./world-field";
import {getCatalogItemDetails} from "@/features/shops/shop-catalog-details";
import {SHOP_CATALOG_FILTER_OPTIONS,type ShopCatalogItem} from "@/features/shops/shop-builder";
import {creationFieldSection,type CreationFrame,type CreationDraft,type CreationTarget} from "./town-shop-creator-model";
import type {BusinessBundle} from "./world-business";
import type {TownReferences,TownSummary} from "./world-towns";
import styles from "./creator-workshop.module.css";

type Choice={value:string;label:string};
type Props={frame:CreationFrame;business:BusinessBundle;towns:TownSummary[];references:TownReferences;disabled:boolean;patch:(key:string,value:CreationDraft[string])=>void;open:(target:CreationTarget)=>void;createIndividual:()=>void;readIndividual:(id:string)=>void;catalog:ShopCatalogItem[];catalogSearch:string;catalogGroup:string;setCatalogSearch:(value:string)=>void;setCatalogGroup:(value:string)=>void;searchCatalog:()=>void};
export function TownShopCreatorFields(p:Props){
 const {frame:f,business:b,towns,references:r,disabled,patch}=p,d=f.draft;
 function field(key:string,label:string,help:string,type:"text"|"textarea"|"number"|"checkbox"="text",choices?:Choice[],nullable=false,maxLength?:number){
  if(creationFieldSection(f.kind,[key])!==f.section)return null;
  const locked=disabled||(!!f.id&&((f.kind==="offering"&&key==="itemId")||(f.kind==="person"&&["geographyId","residentId"].includes(key))||(f.kind==="location"&&["shopId","townId"].includes(key))));
  return <Field key={key} path={key} label={label} help={help}>{choices?<select disabled={locked} value={String(d[key]??"")} aria-label={label} onChange={e=>patch(key,e.target.value||(["cultureId","governmentId"].includes(key)?null:""))}>{choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select>:type==="checkbox"?<input disabled={locked} type="checkbox" checked={!!d[key]} onChange={e=>{patch(key,e.target.checked);if(key==="unlimitedStock")patch("limitedQuantity",e.target.checked?null:0);}}/>:type==="textarea"?<textarea disabled={locked} rows={5} maxLength={maxLength} value={String(d[key]??"")} onChange={e=>patch(key,e.target.value)}/>:<input disabled={locked} type={type} maxLength={maxLength} min={type==="number"?0:undefined} step={type==="number"?(["limitedQuantity","sortOrder"].includes(key)?1:"any"):undefined} value={d[key]===null?"":String(d[key]??"")} onChange={e=>patch(key,type==="number"?(nullable&&e.target.value===""?null:Number(e.target.value)):e.target.value)}/>}</Field>;
 }
 const townChoices=[{value:"",label:f.kind==="shop"?"Choose later - unplaced Shop":"Choose a Town"},...towns.filter(t=>!t.archived||t.id===d.townId).map(t=>({value:t.id,label:`${t.name} (${t.category||"settlement"})`}))];
 const placeChoices=[{value:"",label:"No particular place or building"},...b.places.filter(v=>v.townId===d.townId&&(!v.archived||v.id===d.placeId)).map(v=>({value:v.id,label:`${v.name} (${v.category||"place"})`}))];
 const people=new Map(b.residents.map(person=>[person.id,{value:person.id,label:person.name}]));for(const person of b.individuals)if(!person.archived&&!people.has(person.id))people.set(person.id,{value:person.id,label:person.name});
 if(f.kind==="town")return <>
  {field("name","Town name","A provisional name is enough to begin. The Town keeps its identity across every map appearance.","text",undefined,false,160)}
  {field("category","Type / category","Use your own classification, such as port town, village, capital or an original kind of settlement.","text",undefined,false,120)}
  {field("description","Town overview","Describe the Town's character and what someone first notices. Your paragraphs and wording are preserved.","textarea",undefined,false,12000)}
  {field("population","Population and demographics","Record a known number, estimate or description of the community. Leave unknown information blank; nothing is inferred.","textarea",undefined,false,1200)}
  {field("cultureId","Connected culture","Choose an existing culture from this World's primary History. Your Town's own description stays independent.","text",[{value:"",label:"Undecided or no culture connection"},...r.cultures.filter(c=>!c.archived||c.id===d.cultureId).map(c=>({value:c.id,label:c.name}))])}
  {field("governmentId","Connected government","Reuse a saved government when it applies. No government or ruler is created from prose.","text",[{value:"",label:"Undecided or no government connection"},...r.governments.filter(c=>!c.archived||c.id===d.governmentId).map(c=>({value:c.id,label:c.name}))])}
  {field("locationNotes","Location and surroundings","Describe where the Town is and how it relates to its surroundings. Atlas coordinates are accepted separately.","textarea",undefined,false,1000)}
  {field("background","Origins and background","Develop the Town's history in your own words. Connect saved historical accounts below when useful; their original dates and sources stay intact.","textarea",undefined,false,12000)}
  {f.section==="setting"&&<Field path="historyIds" label="Connected historical accounts" help="Choose existing accounts from primary History. These links do not change their dates or create duplicate events."><select aria-label="Connected historical accounts" multiple value={d.historyIds as string[]} onChange={e=>patch("historyIds",Array.from(e.target.selectedOptions,o=>o.value))}>{r.history.filter(h=>!h.archived||(d.historyIds as string[]).includes(h.id)).map(h=><option key={h.id} value={h.id}>{h.name}{h.archived?" (retained archived account)":""}</option>)}</select></Field>}
  {field("godNotes","Private G.O.D. notes","Secrets, plans and reminders for the World owner and explicit read-only Administrator review. These notes are excluded from ordinary knowledge.","textarea",undefined,false,12000)}
 </>;
 if(f.kind==="shop")return <>
  {field("name","Shop name","Name this particular business. Separate franchise branches can be independent Shops; names never merge records.","text",undefined,false,120)}
  {field("category","Business type / category","For example, general store, smith, healer or an original business in your setting.","text",undefined,false,120)}
  {field("description","Description and atmosphere","Describe what the Shop offers and what makes visiting it distinctive.","textarea",undefined,false,5000)}
  {field("locationNotes","General location notes","Describe access or other useful directions. Individual entrances can also keep their own local notes.","textarea",undefined,false,1000)}
  {!f.id&&<>{field("townId","Initial Town (optional)","Create the business now and place it later, or choose its first Town. Additional entrances can be linked after the Shop is saved.","text",townChoices)}{field("placeId","Initial place or building (optional)","Choose an existing location inside the selected Town.","text",placeChoices)}</>}
  {field("balanceCredits","Baseline Shop balance in Credits","The usual starting balance. This does not change money already held by a Campaign Shop.","number")}
  {field("storefrontState","Usual storefront state","The business's normal availability. Campaign-specific closures remain separate gameplay state.","text",[{value:"closed",label:"Closed"},{value:"open",label:"Open"}])}
  {field("characterPurchaseMode","Character purchase policy","Retain the established choice between immediate purchases and G.O.D. approval.","text",[{value:"god-approval-required",label:"G.O.D. approval required"},{value:"immediate",label:"Immediate purchases"}])}
  {field("soldItemHandling","What happens to Items sold to the Shop?","Choose whether a purchased Item joins Shop stock or leaves active play.","text",[{value:"add-to-shop-stock",label:"Add to Shop stock"},{value:"remove-from-active-play",label:"Remove from active play"}])}
  {field("changedSaleConfirmationMode","Who accepts changed sale terms?","Keep the existing changed-sale acceptance rules.","text",[{value:"character-owner-accepts",label:"Character owner accepts"},{value:"god-approval-finalizes",label:"G.O.D. approval finalizes"}])}
  {field("godNotes","Private G.O.D. notes","Private business information for the author and explicit read-only Administrator review.","textarea",undefined,false,12000)}
 </>;
 if(f.kind==="place")return <>
  {field("placeKind","Kind of location","Choose building or facility, or another place of interest. Your own category stays independent.","text",[{value:"place-of-interest",label:"Place of interest"},{value:"building",label:"Building or facility"}])}
  {field("name",d.placeKind==="building"?"Building name":"Place name","Name the landmark, building, facility or place of interest.","text",undefined,false,120)}
  {field("category","Type / category","Keep your own classification, such as building, inn, monument, meeting place or an original location.","text",undefined,false,120)}
  {field("townId","Town","Choose the Town this place belongs to. You can create the missing Town and return with this draft intact.","text",townChoices)}
  {f.section==="identity"&&<button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>p.open({kind:"town"})}>Create a related Town</button>}
  {field("description","Description and purpose","Explain what happens here, why it matters and what a visitor would notice.","textarea",undefined,false,5000)}
  {field("locationNotes","Location within the Town","Describe directions and surroundings without requiring a street map.","textarea",undefined,false,1000)}
  {field("godNotes","Private G.O.D. notes","Keep hidden features and private author plans here.","textarea",undefined,false,12000)}
  {field("sortOrder","Display order","Lower numbers appear first in the Town's list.","number")}
 </>;
 if(f.kind==="person")return <>
  {field("geographyId","Town, Shop or place","Choose the location of this particular relationship.","text",[{value:"",label:"Choose a location"},...towns.filter(t=>!t.archived).map(t=>({value:t.id,label:`Town: ${t.name}`})),...b.shops.filter(s=>!s.archived).map(s=>({value:s.id,label:`Shop: ${s.definition.name}`})),...b.places.filter(v=>!v.archived).map(v=>({value:v.id,label:`Place: ${v.name}`}))])}
  {field("residentId","World inhabitant","Reuse a saved World person. The full Individual creator is available below when someone is missing.","text",[{value:"",label:"Choose an inhabitant"},...people.values()])}
  {f.section==="person"&&<div className={styles.actions}><button type="button" className="st-button is-secondary" disabled={disabled} onClick={p.createIndividual}>Create a related inhabitant</button>{!!d.residentId&&b.individuals.some(i=>i.id===d.residentId||b.residents.some(r=>r.id===d.residentId&&r.loreId===i.id))&&<button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>p.readIndividual(String(d.residentId))}>Open full Individual creator</button>}</div>}
  {field("role","Role or responsibility","Describe the relationship: proprietor, mayor, guide, resident or a role from your own setting.","text",undefined,false,160)}
  {field("note","Relationship notes","Keep context specific to this place or business. This does not overwrite the person's own story.","textarea",undefined,false,1000)}
  {field("primaryContact","Primary contact","Choose one primary contact for this location. Selecting another replaces the previous primary contact.","checkbox")}
  {field("sortOrder","Display order","Lower numbers appear first.","number")}
 </>;
 if(f.kind==="location")return <>
  {field("shopId","World-owned Shop","Choose the same business whose entrance you want to connect. Its inventory, staff and settings are not copied.","text",[{value:"",label:"Choose a Shop"},...b.shops.filter(s=>!s.archived).map(s=>({value:s.id,label:s.definition.name}))])}
  {field("townId","Town","Choose a Town for this entrance. The Shop can have other entrances as well.","text",townChoices)}
  {field("placeId","Place or building (optional)","Connect the entrance to an existing place inside this Town.","text",placeChoices)}
  {f.section==="location"&&<div className={styles.actions}><button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>p.open({kind:"town"})}>Create a related Town</button><button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>p.open({kind:"place",initial:{townId:String(d.townId??""),category:"building",placeKind:"building"}})}>Create a related building</button>{!d.shopId&&<button type="button" className="st-button is-secondary" disabled={disabled} onClick={()=>p.open({kind:"shop"})}>Create a related Shop</button>}</div>}
  {field("note","Entrance details","Describe this particular entrance and any local access information.","textarea",undefined,false,1000)}
  {field("sortOrder","Display order","Lower numbers appear first.","number")}
 </>;
 const item=p.catalog.find(i=>i.id===Number(d.itemId));
 return <>
  {f.section==="catalog"&&<><div className={styles.group}><Field label="Search existing Items" help="Search both catalog names and canonical IDs. Existing equipment and inventory profiles remain authoritative."><input value={p.catalogSearch} onChange={e=>p.setCatalogSearch(e.target.value)}/></Field><Field label="Catalog group" help="Use the established Equipment and Inventory groupings."><select aria-label="Catalog group" value={p.catalogGroup} onChange={e=>p.setCatalogGroup(e.target.value)}>{SHOP_CATALOG_FILTER_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><button className="st-button is-secondary" type="button" disabled={disabled} onClick={p.searchCatalog}>Search catalog</button></div><Field path="itemId" label="Merchandise Item" help="Select a real catalog Item. A saved offering retains that Item identity; remove and add a different offering to change it."><select aria-label="Merchandise Item" disabled={disabled||!!f.id} value={Number(d.itemId)} onChange={e=>patch("itemId",Number(e.target.value))}><option value={0}>Choose an Item</option>{!item&&Number(d.itemId)>0&&<option value={Number(d.itemId)}>{b.offerings.find(o=>o.id===f.id)?.itemName??"Retained catalog Item"}</option>}{p.catalog.map(i=><option key={i.id} value={i.id}>{i.name} - {i.canonicalId}</option>)}</select></Field>{item&&<article className={styles.group}><h4>{item.name}</h4><p>{item.description}</p><dl>{getCatalogItemDetails(item).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{item.weaponRulesText||item.armorRulesText}</p><p>Catalog price: {item.credits===null?"Not priced":`${item.credits} Credits`} {item.priceBasis}</p></article>}</>}
  {field("fulfillmentKind","Offering fulfillment","Use the established inventory-transfer or service/narrative behavior.","text",[{value:"inventory-transfer",label:"Inventory transfer"},{value:"service-narrative",label:"Service / narrative"}])}
  {field("enabled","Listing enabled","Include this Item in the Shop's usual offerings.","checkbox")}
  {field("unlimitedStock","Unlimited stock","Turn off to set a finite usual quantity, including zero.","checkbox")}
  {!d.unlimitedStock&&field("limitedQuantity","Baseline quantity","A whole number, zero or greater. Campaign purchases change their own stock.","number")}
  {field("sellingPriceOverrideCredits","Selling price override in Credits","Blank uses the catalog price. Zero explicitly means free.","number",undefined,true)}
  {field("buyingPriceOverrideCredits","Buying price override in Credits","Blank uses the catalog price. Buying has its own independent override.","number",undefined,true)}
  {field("shopNote","Shop-specific offering notes","Describe anything specific to this business's offering.","textarea",undefined,false,1000)}
  {field("sortOrder","Display order","Lower numbers appear first in the merchandise list.","number")}
 </>;
}
