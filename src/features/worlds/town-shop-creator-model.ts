import {emptyTown,type TownRecord} from "./world-towns";
import {emptyShop,emptyOffering,type BusinessBundle,type BusinessShop,type BusinessPlace,type BusinessOffering,type BusinessPerson,type BusinessShopLocation} from "./world-business";

export type CreationKind="town"|"shop"|"place"|"offering"|"person"|"location";
export type CreationDraft=Record<string,string|number|boolean|null|string[]>;
export type CreationFrame={key:string;kind:CreationKind;id:string|null;revision:number|null;geographyRevision:number|null;section:string;draft:CreationDraft;base:CreationDraft;requestId:string;conflicts:string[];attempt?:unknown;notice?:string};
export type CreationTarget={kind:CreationKind;record?:TownRecord|BusinessShop|BusinessPlace|BusinessOffering|BusinessPerson|BusinessShopLocation;initial?:CreationDraft;section?:string};
export const creationSections:Record<CreationKind,{id:string;label:string;introduction:string}[]>={
 town:[
  {id:"identity",label:"Identity",introduction:"Give this place its own identity. A name is enough to begin; its history and character can grow as you create."},
  {id:"character",label:"Character & community",introduction:"Describe the people and customs that make the Town feel alive. Unknown numbers and undecided details can remain blank."},
  {id:"setting",label:"Setting & History",introduction:"Place the Town within your World and connect existing historical accounts without duplicating or changing them."},
  {id:"places",label:"Places of interest",introduction:"Develop the locations that give the Town its character: gathering places, landmarks, shrines, markets and original places."},
  {id:"buildings",label:"Buildings & facilities",introduction:"Create buildings and facilities, describe their purpose and connect their people and businesses. Detailed street and floor-plan drawing remains separate."},
  {id:"shops",label:"Shops & services",introduction:"Create businesses here, or connect an existing World-owned Shop. Its staff, merchandise and policies stay with that same business."},
  {id:"people",label:"Residents & associations",introduction:"Connect real World inhabitants and describe their roles. Staff from linked Shops and people associated with places remain connected through their original relationships."},
  {id:"atlas",label:"Atlas appearances",introduction:"This Town keeps one identity across its map appearances. A map marker is a representation; removing it does not delete the Town."},
  {id:"private",label:"Author notes",introduction:"Keep private ideas, secrets and reminders for the World author and explicit read-only Administrator review."},
 ],
 shop:[
  {id:"identity",label:"Business identity",introduction:"Establish the business, its purpose and atmosphere. You can develop a Shop before choosing its Town or building."},
  {id:"locations",label:"Towns & entrances",introduction:"Most Shops have one location. When you choose, the same Shop can have entrances in several towns. Separate franchise branches can remain independent Shops."},
  {id:"merchandise",label:"Merchandise & stock",introduction:"Reuse actual catalog Items and configure the usual merchandise, stock and prices. Each Campaign keeps its own later stock changes."},
  {id:"staff",label:"Proprietors & staff",introduction:"Choose World inhabitants, record their responsibilities and select a primary contact. Reuse existing people rather than creating copies for each entrance."},
  {id:"commerce",label:"Buying & selling",introduction:"Retain the established purchase, sale and changed-terms policies. These are World-defined defaults, separate from a Campaign's transaction history."},
  {id:"private",label:"Author notes",introduction:"Private business information is kept apart from the ordinary description."},
 ],
 place:[
  {id:"identity",label:"Identity & purpose",introduction:"Give this place of interest or building a name and a purpose within its Town. Describe something original without needing a map first."},
  {id:"setting",label:"Description & location",introduction:"Describe what makes the location worth visiting and how to find it. Keep the creator's own wording and leave unknown details undecided."},
  {id:"people",label:"People & businesses",introduction:"Connect the people who belong here and the businesses that use this location. Related creations save separately and keep their own identities."},
  {id:"private",label:"Author notes",introduction:"Keep hidden features, secrets and reminders private to the author."},
 ],
 offering:[
  {id:"catalog",label:"Choose merchandise",introduction:"Browse the existing Equipment and Inventory catalogs, including the established weapon, armor and Item details."},
  {id:"stock",label:"Stock & fulfillment",introduction:"Choose physical inventory transfer or a service, and configure unlimited or finite usual stock."},
  {id:"pricing",label:"Buying & selling prices",introduction:"A blank override uses the catalog price; zero is an explicit price. Buying and selling have independent overrides."},
  {id:"notes",label:"Offering notes",introduction:"Keep information specific to this Shop's offering and choose its display order."},
 ],
 person:[
  {id:"person",label:"Choose an inhabitant",introduction:"Use an existing World inhabitant or create a related person in the full Individual workshop. Campaign Characters and NPCs keep separate gameplay identities."},
  {id:"role",label:"Role & responsibilities",introduction:"Describe this particular relationship, its responsibilities and who serves as the primary contact."},
 ],
 location:[
  {id:"location",label:"Town & building",introduction:"Link another Town or an optional place to this same Shop. This creates an entrance relationship, not a copy of its inventory, staff or settings."},
  {id:"notes",label:"Entrance details",introduction:"Describe how this entrance is reached and any relevant local information."},
 ],
};
export function createFrame(target:CreationTarget):CreationFrame{
 const r=target.record;let draft:CreationDraft;
 if(target.kind==="town")draft=r?{...(r as TownRecord).draft}:{...emptyTown,historyIds:[]};
 else if(target.kind==="shop"){const s=r as BusinessShop|undefined;draft={...(s?.definition??emptyShop),townId:"",placeId:"",godNotes:s?.godNotes??"",sortOrder:s?.sortOrder??0};}
 else if(target.kind==="place"){const p=r as BusinessPlace|undefined;draft={townId:p?.townId??"",placeKind:p?.placeKind??"place-of-interest",name:p?.name??"",category:p?.category??"place of interest",description:p?.description??"",locationNotes:p?.locationNotes??"",godNotes:p?.godNotes??"",sortOrder:p?.sortOrder??0};}
 else if(target.kind==="offering"){const o=r as BusinessOffering|undefined;draft={...(o?.definition??emptyOffering),shopId:o?.shopId??"",sortOrder:o?.sortOrder??0};}
 else if(target.kind==="person"){const p=r as BusinessPerson|undefined;draft={geographyId:p?.geographyId??"",residentId:p?.residentId??"",role:p?.role??"",note:p?.note??"",primaryContact:p?.primaryContact??false,sortOrder:p?.sortOrder??0};}
 else{const l=r as BusinessShopLocation|undefined;draft={shopId:l?.shopId??"",townId:l?.townId??"",placeId:l?.placeId??"",note:l?.note??"",sortOrder:l?.sortOrder??0};}
 draft={...draft,...target.initial};return {key:crypto.randomUUID(),kind:target.kind,id:r?.id??null,revision:r?.revision??null,geographyRevision:target.kind==="town"?(r as TownRecord|undefined)?.geographyRevision??null:null,section:target.section??creationSections[target.kind][0].id,draft,base:structuredClone(draft),requestId:crypto.randomUUID(),conflicts:[]};
}
export function creationFieldSection(kind:CreationKind,path:readonly PropertyKey[]):string{
 const key=String(path.filter(p=>p!=="draft"&&p!=="definition")[0]??"");
 if(kind==="town")return ["population","cultureId","governmentId"].includes(key)?"character":["background","locationNotes","historyIds"].includes(key)?"setting":key==="godNotes"?"private":"identity";
 if(kind==="shop")return ["townId","placeId"].includes(key)?"locations":["balanceCredits","storefrontState","characterPurchaseMode","soldItemHandling","changedSaleConfirmationMode"].includes(key)?"commerce":key==="godNotes"?"private":"identity";
 if(kind==="place")return ["description","locationNotes"].includes(key)?"setting":key==="godNotes"?"private":"identity";
 if(kind==="offering")return key==="itemId"?"catalog":["sellingPriceOverrideCredits","buyingPriceOverrideCredits"].includes(key)?"pricing":["shopNote","sortOrder"].includes(key)?"notes":"stock";
 if(kind==="person")return ["geographyId","residentId"].includes(key)?"person":"role";
 return ["note","sortOrder"].includes(key)?"notes":"location";
}
export function liveCreationFrame(frame:CreationFrame,towns:TownRecord[],business:BusinessBundle):CreationTarget["record"]|undefined{
 return (frame.kind==="town"?towns:frame.kind==="shop"?business.shops:frame.kind==="place"?business.places:frame.kind==="offering"?business.offerings:frame.kind==="person"?business.people:business.shopLocations).find(r=>r.id===frame.id);
}
