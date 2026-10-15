import {z} from "zod";
import {geoId} from "./geographic";
import {rasterManifestSchema,rasterPreferencesSchema} from "./raster";
import {categoricalManifestSchema,categoricalPreferencesSchema} from "./categorical-raster";

const positive=z.number().int().positive(),tile=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),width:positive.max(256),height:positive.max(256),key:z.string().max(200)}).strict();
const common={previewReader:z.string().min(1).optional(),sourceId:geoId,versionId:geoId,revision:positive,viewRevision:positive,stamp:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(1).max(160),canEdit:z.boolean(),protected:z.boolean(),archived:z.boolean(),versions:z.array(z.object({id:geoId,revision:positive,protected:z.boolean(),archived:z.boolean()}).strict()).max(100)};
export const elevationResponseSchema=z.object({...common,grid:rasterManifestSchema.shape.grid,level:rasterManifestSchema.shape.levels.element,tiles:z.array(tile.extend({key:z.string().regex(/^(shaded|tint)\/\d+\/\d+-\d+\.webp$/)})).max(16),preferences:rasterPreferencesSchema,credit:rasterManifestSchema.shape.source,statistics:rasterManifestSchema.shape.statistics}).strict().nullable();
export const landCoverResponseSchema=z.object({...common,account:z.string().nullable(),grid:categoricalManifestSchema.shape.grid,classes:categoricalManifestSchema.shape.classes,level:categoricalManifestSchema.shape.levels.element,tiles:z.array(tile.extend({key:z.string().regex(/^classification\/\d+\/\d+-\d+\.png$/)})).max(16),preferences:categoricalPreferencesSchema,credit:categoricalManifestSchema.shape.source,statistics:categoricalManifestSchema.shape.statistics}).strict().nullable();
export function parseRasterResponse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new Error("The geographic layer response could not be read. Your draft is retained; retry this layer.");return result.data;}
/** Presentation correction only: retain the immutable provider receipt bytes. */
export function classificationAttribution(credit:{provider:string;edition:string;attribution:string}){return credit.provider==="ESA WorldCover consortium"&&credit.edition==="2021 v200; selected GeoTIFF image 6"?`© ${credit.attribution.replace(/^©\s*/,"")}`:credit.attribution;}
