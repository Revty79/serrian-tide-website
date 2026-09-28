import "server-only";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { readRaceEvolutionsInTransaction } from "@/features/races/race-evolution-service";
import { readCreatureEvolutionsInTransaction } from "@/features/creatures/creature-evolution-service";
import { requireEvolutionId } from "@/features/creatures/creature-evolutions";
import type { EvolutionOwner } from "./evolution-requirements";
import type { EvolutionPathReference } from "./evolution-destination";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Trusted server read boundary. Caller supplies its own authoring/runtime authorization.
 * Does not evaluate an individual, merge parent paths or mutate any state.
 */
export async function readEvolutionPathReferencesInTransaction(tx: Transaction, kind: EvolutionOwner, sourceId: number): Promise<EvolutionPathReference[]> {
  if(kind !== "race" && kind !== "creature") throw new Error("Choose Race or Creature.");
  requireEvolutionId(sourceId,"Source definition");
  const table = kind === "race" ? race : creature;
  const [source] = await tx.select({archivedAt:table.archivedAt}).from(table).where(eq(table.id,sourceId));
  if(!source) throw new Error("Source definition no longer exists.");
  const paths = kind === "race" ? await readRaceEvolutionsInTransaction(tx,sourceId) : await readCreatureEvolutionsInTransaction(tx,sourceId);
  return paths.map(path => ({kind,pathId:path.id,pathVersion:path.version,pathName:path.name,sourceId,
    destinationId:path.destination.id,destinationName:"name" in path.destination ? path.destination.name : path.destination.canonicalName,
    requirementMode:path.requirementMode,sourceArchived:!!source.archivedAt,destinationArchived:path.destination.archived,
    available:!source.archivedAt && !path.destination.archived}));
}
