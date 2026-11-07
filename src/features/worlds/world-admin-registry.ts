import { z } from "zod";
export const worldAdminQuerySchema=z.object({
  q:z.string().trim().max(160).default(""),status:z.enum(["active","archived","all"]).default("all"),sharing:z.enum(["private","shared","all"]).default("all"),
  classification:z.string().trim().max(160).default(""),sort:z.enum(["name","owner","created","activity"]).default("activity"),direction:z.enum(["asc","desc"]).default("desc"),page:z.coerce.number().int().min(0).max(100000).default(0),
});
export type WorldAdminQuery=z.infer<typeof worldAdminQuerySchema>;
export type WorldAdminRow={id:string;name:string;ownerId:string;ownerName:string;ownerUsername:string|null;createdAt:string;updatedAt:string;archived:boolean;participants:number;pendingInvitations:number;shared:boolean;canon?:boolean;classifications:{id:number;name:string;group:string}[]};
export type WorldAdminPage={query:WorldAdminQuery;rows:WorldAdminRow[];hasMore:boolean;pageSize:number};
