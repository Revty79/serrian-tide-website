import {z} from "zod";
export const geographyTemplateCoverSchema=z.enum(["woodland","arid","wetland","alpine","volcanic"]);
export type GeographyTemplateCover=z.infer<typeof geographyTemplateCoverSchema>;
export const geographyTemplateEnvironmentSchema=z.object({kind:geographyTemplateCoverSchema,id:z.uuid()}).strict();
export type GeographyTemplateEnvironment=z.infer<typeof geographyTemplateEnvironmentSchema>;
