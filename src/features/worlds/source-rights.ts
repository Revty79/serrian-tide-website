import {z} from "zod";

/** Claims are intake information. Only a separately recorded review grants external rights. */
export const sourceClasses=["original","public-domain","attribution","special-review","unverified","incompatible"] as const;
export const sourceUses=["display","modify","customer-access","digital-images","print","editable-data"] as const;
export type SourceUse=typeof sourceUses[number];
const text=z.string().trim().min(1).max(4000).regex(/^[^\u0000]*$/);
const link=z.string().url().max(2000).refine(v=>{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;},"Use a public HTTPS evidence link without credentials.");
export const sourceEvidenceSchema=z.object({
 classification:z.enum(sourceClasses),provider:text,dataset:text,edition:text,
 sourceUrl:link,license:text,licenseUrl:link,fileSha256:z.string().regex(/^[a-f0-9]{64}$/),
 retrievedAt:z.iso.datetime(),termsEvidence:text,serviceTerms:text,upstream:text,
 cost:z.enum(["no-cost","purchased","unknown"]),requiredCredits:z.string().max(12000).regex(/^[^\u0000]*$/),
 modifications:text,exceptions:text,
}).strict();
export type SourceEvidence=z.infer<typeof sourceEvidenceSchema>;
export const sourceReviewSchema=z.object({
 decision:z.enum(["approved","hold","rejected"]),classification:z.enum(sourceClasses),
 reason:text,evidence:text,uses:z.array(z.enum(sourceUses)).max(sourceUses.length),
 credits:z.string().max(12000).regex(/^[^\u0000]*$/),
 serviceVerified:z.boolean(),upstreamVerified:z.boolean(),noCostVerified:z.boolean(),
 outputVerified:z.boolean(),recipientRightsVerified:z.boolean(),
}).strict().superRefine((v,c)=>{
 if(v.decision!=="approved")return;
 if(!["original","public-domain","attribution"].includes(v.classification))c.addIssue({code:"custom",message:"Unverified, incompatible and special-review sources cannot be approved through this workflow."});
 if(!v.serviceVerified||!v.upstreamVerified||!v.noCostVerified)c.addIssue({code:"custom",message:"Verify upstream ownership, access terms and no-cost rights before approving a source."});
 if(v.classification==="attribution"&&!v.credits.trim())c.addIssue({code:"custom",message:"Enter the complete mandatory notices before approving attribution-based material."});
 if(!v.uses.includes("display"))c.addIssue({code:"custom",message:"Approval must cover map display."});
});
export type SourceReview=z.infer<typeof sourceReviewSchema>;
export type RightsSource={id:string;ownerId:string;subjectKind:string;subjectId:string;subjectVersion:string;evidence:SourceEvidence|null;original:boolean;parentIds:string[];createdAt:string;reviews:(SourceReview&{revision:number;reviewerId:string;createdAt:string})[]};
export type RightsSummary={available:boolean;sources:RightsSource[];uses:{sourceId:string;kind:string;targetId:string;version:string;note:string}[];credits:string[];holds:string[];canRegister:boolean;canReview:boolean};
export function sourceUseProblem(source:Pick<RightsSource,"original"|"reviews"|"parentIds">,use:SourceUse,output=false):string|null{
 const review=source.reviews[0];
 if(!review)return source.original||source.parentIds.length?null:"Needs a source-rights review.";
 if(review.decision!=="approved")return review.reason;
 if(!["original","public-domain","attribution"].includes(review.classification)||!review.noCostVerified||!review.upstreamVerified||!review.serviceVerified)return "Source review is incomplete.";
 if(!review.uses.includes(use))return `This source is not approved for ${use.replaceAll("-"," ")}.`;
 if((output||use==="customer-access")&&(!review.outputVerified||!review.recipientRightsVerified))return "Source rights were reviewed, but product attribution and recipient rights still need verification.";
 if(review.classification==="attribution"&&!review.credits.trim())return "Mandatory source notices are missing.";
 return null;
}
export const sourceRightsCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("register"),requestId:z.string().uuid(),sourceId:z.string().uuid(),evidence:sourceEvidenceSchema}).strict(),
 z.object({action:z.literal("attach"),requestId:z.string().uuid(),sourceId:z.string().uuid(),note:text}).strict(),
 z.object({action:z.literal("review"),requestId:z.string().uuid(),sourceId:z.string().uuid(),revision:z.number().int().nonnegative(),review:sourceReviewSchema}).strict(),
]);
export const assetOriginSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("original"),attestation:z.literal(true)}).strict(),
 z.object({kind:z.literal("external"),sourceId:z.string().uuid()}).strict(),
]);
export type AssetOrigin=z.infer<typeof assetOriginSchema>;
