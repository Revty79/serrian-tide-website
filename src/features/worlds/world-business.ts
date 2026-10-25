import {z} from "zod";
import {normalizeShopDefinition,normalizeOfferingDefinition,type ShopCoreValues,type ShopOfferingValues} from "@/features/shops/shop-builder";
export type ShopDefinition=Omit<ShopCoreValues,"campaignId">;
export type OfferingDefinition=Omit<ShopOfferingValues,"shopId"|"campaignId">;
const text=(max:number)=>z.string().trim().max(max),id=z.uuid(),revision=z.number().int().positive(),order=z.number().int().min(0).max(100000);
const normalize=<T>(run:(input:T)=>T)=>(input:T,ctx:z.RefinementCtx):T=>{try{return run(input);}catch(e){ctx.addIssue({code:"custom",message:(e as Error).message});return z.NEVER;}};
export const shopDefinitionSchema=z.object({name:text(120).min(1),category:text(120).min(1),description:text(5000),locationNotes:text(1000),balanceCredits:z.number().finite().nonnegative(),storefrontState:z.enum(["open","closed"]),characterPurchaseMode:z.enum(["immediate","god-approval-required"]),soldItemHandling:z.enum(["add-to-shop-stock","remove-from-active-play"]),changedSaleConfirmationMode:z.enum(["character-owner-accepts","god-approval-finalizes"])}).strict().transform(normalize(normalizeShopDefinition));
export const offeringDefinitionSchema=z.object({itemId:z.number().int().positive(),fulfillmentKind:z.enum(["inventory-transfer","service-narrative"]),enabled:z.boolean(),unlimitedStock:z.boolean(),limitedQuantity:z.number().int().nonnegative().nullable(),sellingPriceOverrideCredits:z.number().finite().nonnegative().nullable(),buyingPriceOverrideCredits:z.number().finite().nonnegative().nullable(),shopNote:text(1000)}).strict().transform(normalize(normalizeOfferingDefinition));
export const emptyShop:ShopDefinition={name:"",category:"shop",description:"",locationNotes:"",balanceCredits:0,storefrontState:"closed",characterPurchaseMode:"god-approval-required",soldItemHandling:"add-to-shop-stock",changedSaleConfirmationMode:"character-owner-accepts"};
export const emptyOffering:OfferingDefinition={itemId:0,fulfillmentKind:"inventory-transfer",enabled:true,unlimitedStock:true,limitedQuantity:null,sellingPriceOverrideCredits:null,buyingPriceOverrideCredits:null,shopNote:""};
export const placeDefinitionSchema=z.object({townId:id,placeKind:z.enum(["place-of-interest","building"]).default("place-of-interest"),name:text(120).min(1),category:text(120),description:text(5000),locationNotes:text(1000),godNotes:text(12000),sortOrder:order});
export const residentDefinitionSchema=z.object({name:text(160).min(1),description:text(12000),godNotes:text(12000),loreId:id.nullable()});
const common={requestId:id},identity={id:id.nullable(),revision:revision.nullable()};
export const businessCommandSchema=z.discriminatedUnion("action",[
 z.object({...common,...identity,action:z.literal("save-shop"),definition:shopDefinitionSchema,townId:id.nullable(),placeId:id.nullable(),godNotes:text(12000),sortOrder:order}),
 z.object({...common,...identity,action:z.literal("save-location"),shopId:id,townId:id,placeId:id.nullable(),note:text(1000),sortOrder:order}),
 z.object({...common,action:z.literal("remove-location"),id,revision}),
 z.object({...common,...identity,action:z.literal("save-place"),draft:placeDefinitionSchema}),
 z.object({...common,...identity,action:z.literal("save-resident"),draft:residentDefinitionSchema}),
 z.object({...common,action:z.literal("lifecycle"),kind:z.enum(["shop","place","resident"]),id,revision,archived:z.boolean(),reason:text(1000)}),
 z.object({...common,...identity,action:z.literal("save-offering"),shopId:id,definition:offeringDefinitionSchema,sortOrder:order}),
 z.object({...common,action:z.literal("remove-offering"),id,revision}),
 z.object({...common,...identity,action:z.literal("save-person"),geographyId:id,residentId:id,role:text(160),note:text(1000),primaryContact:z.boolean(),sortOrder:order}),
 z.object({...common,action:z.literal("remove-person"),id,revision}),
]).superRefine((command,context)=>{if(command.action==="lifecycle"&&command.kind==="resident"&&command.reason)context.addIssue({code:"custom",path:["reason"],message:"Inhabitants use private notes for background; archiving does not take an archive reason."});});
export type BusinessResult={id:string;kind:string};
export type BusinessShop={id:string;revision:number;archived:boolean;definition:ShopDefinition;godNotes:string;sortOrder:number;archiveReason:string};
export type BusinessShopLocation={id:string;shopId:string;townId:string;placeId:string|null;note:string;sortOrder:number;revision:number};
export type BusinessPlace={id:string;revision:number;archived:boolean;townId:string;placeKind:"place-of-interest"|"building";name:string;description:string;category:string;locationNotes:string;godNotes:string;sortOrder:number;archiveReason:string};
export type BusinessResident={id:string;revision:number;archived:boolean;name:string;description:string;godNotes:string;loreId:string|null};
export type BusinessOffering={id:string;shopId:string;revision:number;definition:OfferingDefinition;sortOrder:number;itemName:string;canonicalPrice:number|null};
export type BusinessPerson={id:string;geographyId:string;residentId:string;role:string;note:string;primaryContact:boolean;sortOrder:number;revision:number};
export type BusinessBundle={shops:BusinessShop[];shopLocations:BusinessShopLocation[];places:BusinessPlace[];residents:BusinessResident[];people:BusinessPerson[];offerings:BusinessOffering[];individuals:{id:string;name:string;archived:boolean}[];canEdit:boolean};
