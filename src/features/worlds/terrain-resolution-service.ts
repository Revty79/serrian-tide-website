import "server-only";
import {sql} from "drizzle-orm";
import {db} from "@/db";
type Connection=Pick<typeof db,"execute">;
export async function expandedTerrainAvailable(tx:Connection=db){return !!(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.world_terrain_transfer') is not null ok`)).rows[0]?.ok;}
