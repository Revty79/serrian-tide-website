import {z} from "zod";
import {atlasId,type GeographyRecord} from "./atlas";

export const GEOGRAPHY_PAGE_SIZE=40;
export const REGIONAL_GEOGRAPHY_CONTEXTS=["place","region","local area"] as const;
export const geographyDirectoryQuery=z.object({parentId:atlasId.nullable().default(null),after:atlasId.optional(),search:z.string().trim().max(160).default(""),headersOnly:z.boolean().default(false)}).strict();
export type GeographyDirectoryQuery=z.infer<typeof geographyDirectoryQuery>;
export type GeographyDirectory={canEdit:boolean;parent:GeographyRecord|null;ancestors:GeographyRecord[];records:(GeographyRecord&{hasChildren:boolean})[];nextAfter:string|null};

/** A literal name search; wildcard characters must not change its meaning. */
export function geographySearchPattern(search:string){return `%${search.replace(/[\\%_]/g,"\\$&")}%`;}
