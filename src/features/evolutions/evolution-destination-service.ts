import "server-only";
import { createHash } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { user } from "@/db/auth-schema";
import { creature, creatureEvolutionPath } from "@/db/creature-schema";
import { race, raceAttributeCap, raceMovementMode, raceSkillLink } from "@/db/race-schema";
import { raceEvolutionPath } from "@/db/race-evolution-schema";
import { evolutionDestinationCreation } from "@/db/evolution-destination-schema";
import { assertCanEditSharedLibraryRoot } from "@/features/authorization/shared-library-access";
import { copyCreatureDefinitionInTransaction } from "@/features/creatures/creature-clone-service";
import { readCreatureNpcTemplateInTransaction } from "@/features/creatures/creature-npc-constructor-service";
import { insertCreatureEvolutionInTransaction } from "@/features/creatures/creature-evolution-service";
import { copyRaceDefinitionInTransaction } from "@/features/races/race-variant-service";
import { insertRaceEvolutionInTransaction } from "@/features/races/race-evolution-service";
import { readRaceFormsInTransaction } from "@/features/races/race-form-service";
import { readRaceNaturalAttacksInTransaction } from "@/features/races/race-natural-attack-service";
import { readRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { requireEvolutionId } from "@/features/creatures/creature-evolutions";
import { stableEvolutionJson } from "./evolution-execution";
import type { EvolutionOwner } from "./evolution-requirements";
import { destinationCanonicalId, normalizeDestinationCreation, type CreateEvolutionDestinationInput, type CreatedEvolutionDestination, type EvolutionDestinationPreparation } from "./evolution-destination";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Root = typeof race.$inferSelect | typeof creature.$inferSelect;
const digest = (value: unknown) => createHash("sha256").update(stableEvolutionJson(value)).digest("hex");
const rootName = (root: Root) => "name" in root ? root.name : root.canonicalName;

async function authorize(tx: Transaction, kind: EvolutionOwner, sourceId: number, actorUserId: string, lock: boolean) {
  if (kind !== "race" && kind !== "creature") throw new Error("Choose Race or Creature.");
  requireEvolutionId(sourceId,"Source definition");
  const accountQuery = tx.select({ id:user.id }).from(user).where(eq(user.id,actorUserId));
  const [account] = await (lock ? accountQuery.for("share") : accountQuery);
  if (!account) throw new Error("You must be signed in.");
  const rolesQuery = tx.select({ role:userRole.role }).from(userRole).where(eq(userRole.userId,actorUserId));
  const roles = await (lock ? rolesQuery.for("share") : rolesQuery);
  const table = kind === "race" ? race : creature;
  const query = tx.select().from(table).where(eq(table.id,sourceId));
  const [source] = await (lock ? query.for("no key update") : query);
  if (!source) throw new Error("The source definition no longer exists.");
  assertCanEditSharedLibraryRoot({userId:actorUserId,roles:roles.map(row=>row.role)},source,kind === "race" ? "Race" : "Creature");
  if (source.archivedAt) throw new Error("Restore the source definition before creating an Evolution destination.");
  return source;
}

/** Normal authored content only: outgoing paths, individual state and history are excluded. */
async function sourceToken(tx: Transaction, kind: EvolutionOwner, source: Root) {
  if (kind === "creature") return digest({ source, definition:await readCreatureNpcTemplateInTransaction(tx,source.id,{lock:false}) });
  const caps = await tx.select().from(raceAttributeCap).where(eq(raceAttributeCap.raceId,source.id)).orderBy(asc(raceAttributeCap.id));
  const movement = await tx.select().from(raceMovementMode).where(eq(raceMovementMode.raceId,source.id)).orderBy(asc(raceMovementMode.id));
  const skills = await tx.select().from(raceSkillLink).where(eq(raceSkillLink.raceId,source.id)).orderBy(asc(raceSkillLink.id));
  return digest({source,caps,movement,skills,forms:await readRaceFormsInTransaction(tx,source.id),
    attacks:await readRaceNaturalAttacksInTransaction(tx,source.id),protections:await readRaceNaturalProtectionInTransaction(tx,source.id)});
}

export async function prepareEvolutionDestination(kind: EvolutionOwner, sourceId: number, requestKey: string, actorUserId: string): Promise<EvolutionDestinationPreparation> {
  const canonicalId = destinationCanonicalId(kind,requestKey);
  return db.transaction(async tx => {
    const source = await authorize(tx,kind,sourceId,actorUserId,false);
    return {kind,sourceId,sourceName:rootName(source),sourceToken:await sourceToken(tx,kind,source),requestKey,canonicalId};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}

export async function createEvolutionDestination(input: CreateEvolutionDestinationInput, actorUserId: string): Promise<CreatedEvolutionDestination> {
  const values = normalizeDestinationCreation(input), requestHash = digest({actorUserId,...values});
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`set local lock_timeout='3s'`);
      await tx.execute(sql`set local statement_timeout='20s'`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`evolution-destination:${values.requestKey}`}))`);
      const [receipt] = await tx.select().from(evolutionDestinationCreation).where(eq(evolutionDestinationCreation.requestKey,values.requestKey));
      if (receipt && (receipt.actorUserId !== actorUserId || receipt.requestHash !== requestHash)) throw new Error("This creation request was already used with different details. Resume its original request.");
      const source = await authorize(tx,values.kind,values.sourceId,actorUserId,true);
      if (receipt) {
        const target = values.kind === "race" ? race : creature;
        const paths = values.kind === "race" ? raceEvolutionPath : creatureEvolutionPath;
        const [destination] = await tx.select({id:target.id}).from(target).where(eq(target.id,receipt.result.destinationId));
        const [path] = await tx.select({id:paths.id}).from(paths).where(eq(paths.id,receipt.result.pathId));
        if (!destination || !path) throw new Error(`This request already created destination #${receipt.result.destinationId} and path #${receipt.result.pathId}, but a record was later removed. Nothing was recreated.`);
        return receipt.result;
      }
      if (await sourceToken(tx,values.kind,source) !== values.sourceToken) throw new Error("The saved source changed. Close this dialog and review/reload the source before creating a destination.");
      let destinationId: number, createdPath: {id:number;version:number};
      if (values.kind === "creature") {
        const [conflict] = await tx.select({id:creature.id}).from(creature).where(eq(creature.canonicalId,values.canonicalId!));
        if (conflict) throw new Error("The destination canonical ID already exists. Close and reopen destination creation for a new system ID.");
        destinationId = await copyCreatureDefinitionInTransaction(tx,source as typeof creature.$inferSelect,{name:values.destinationName,canonicalId:values.canonicalId!,actorUserId,parentCreatureId:null,copyEvolutions:false});
        createdPath = await insertCreatureEvolutionInTransaction(tx,{sourceCreatureId:source.id,destinationCreatureId:destinationId,name:values.pathName,description:values.description,notes:values.notes});
      } else {
        destinationId = await copyRaceDefinitionInTransaction(tx,source as typeof race.$inferSelect,{name:values.destinationName,actorUserId,parentRaceId:null,copyEvolutions:false});
        createdPath = await insertRaceEvolutionInTransaction(tx,{sourceRaceId:source.id,destinationRaceId:destinationId,name:values.pathName,description:values.description,notes:values.notes});
      }
      const result: CreatedEvolutionDestination = {kind:values.kind,sourceId:source.id,sourceName:rootName(source),destinationId,destinationName:values.destinationName,canonicalId:values.canonicalId,pathId:createdPath.id,pathVersion:createdPath.version};
      await tx.insert(evolutionDestinationCreation).values({requestKey:values.requestKey,actorUserId,requestHash,result});
      return result;
    });
  } catch(error) {
    let cause: unknown = error;
    while(cause && typeof cause === "object") {
      if("code" in cause && ["55P03","40P01","40001","57014"].includes(String(cause.code))) throw new Error("The source or related authoring is busy. Retry this request; no partial destination was saved.");
      if("code" in cause && cause.code === "23505") throw new Error("A destination canonical identity already exists. Close and reopen creation for a new system ID; nothing was partially saved.");
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}

/** After an error, only a fresh serialized read may declare a request uncommitted.
 * A lost COMMIT acknowledgement must not release the browser's original request.
 */
export async function destinationCreationHasReceipt(requestKey: string): Promise<boolean> {
  destinationCanonicalId("creature",requestKey);
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout='3s'`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`evolution-destination:${requestKey}`}))`);
    const [receipt]=await tx.select({key:evolutionDestinationCreation.requestKey}).from(evolutionDestinationCreation).where(eq(evolutionDestinationCreation.requestKey,requestKey));
    return !!receipt;
  });
}
