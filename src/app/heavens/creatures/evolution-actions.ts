"use server";
import { revalidatePath } from "next/cache";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";
import { findEvolutionDestinations, readCreatureEvolutionAuthoring, removeCreatureEvolution, reorderCreatureEvolutions, saveCreatureEvolution } from "@/features/creatures/creature-evolution-service";
import type { EvolutionPathInput } from "@/features/creatures/creature-evolutions";
import { readEvolutionRequirementAuthoring, saveEvolutionRequirements } from "@/features/creatures/creature-evolution-service";
import type { EvolutionRequirements } from "@/features/creatures/evolution-requirements";
import { listEvolutionPreviewIndividuals, previewEvolutionForActor } from "@/features/creatures/evolution-eligibility-service";
import { asc, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { item } from "@/db/item-schema";
import { catalogCandidateWhere, itemDiscoveryWhere } from "@/features/catalog-visibility/catalog-query";

async function actor() {
  const { session, roles } = await requireGodOrAdminAccessContext();
  return { userId: session.user.id, roles };
}

export async function getCreatureEvolutions(sourceCreatureId: number) {
  return readCreatureEvolutionAuthoring(sourceCreatureId, await actor());
}

export async function searchEvolutionDestinations(sourceCreatureId: number, search: string) {
  return findEvolutionDestinations(sourceCreatureId, search, await actor());
}

export async function saveEvolutionPath(input: EvolutionPathInput) {
  const paths = await saveCreatureEvolution(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}

export async function removeEvolutionPath(input: { sourceCreatureId: number; id: number; expectedVersion: number }) {
  const paths = await removeCreatureEvolution(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}

export async function reorderEvolutionPaths(input: { sourceCreatureId: number; paths: Array<{ id: number; version: number }> }) {
  const paths = await reorderCreatureEvolutions(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}

export async function getEvolutionRequirements(sourceCreatureId: number, pathId: number) {
  return readEvolutionRequirementAuthoring(sourceCreatureId, pathId, await actor());
}
export async function saveEvolutionPathRequirements(input: { sourceCreatureId: number; pathId: number; expectedVersion: number; requirements: EvolutionRequirements }) {
  const paths = await saveEvolutionRequirements(input, await actor());
  revalidatePath("/heavens/creatures");
  return paths;
}
export async function searchEvolutionRequirementReferences(kind: "skill" | "item" | "derived-ability", search: string) {
  const current = await actor(), term = `%${search.trim().slice(0,200)}%`;
  if (kind === "skill") return db.select({ id: skill.id, name: skill.name }).from(skill).where(await catalogCandidateWhere("skill", skill, current.userId, [], isNull(skill.archivedAt), ilike(skill.name, term))).orderBy(asc(skill.name), asc(skill.id)).limit(30);
  if (kind === "derived-ability") return db.select({ id: derivedAbility.id, name: derivedAbility.name }).from(derivedAbility).where(await catalogCandidateWhere("derivedAbility", derivedAbility, current.userId, [], isNull(derivedAbility.archivedAt), ilike(derivedAbility.name, term))).orderBy(asc(derivedAbility.name), asc(derivedAbility.id)).limit(30);
  if (kind !== "item") throw new Error("Choose Skill or Item references.");
  return db.select({ id: item.id, name: item.name }).from(item).where(await itemDiscoveryWhere(current.userId, isNull(item.archivedAt), ilike(item.name, term))).orderBy(asc(item.name), asc(item.id)).limit(30);
}
export async function findEvolutionPreviewIndividuals(sourceCreatureId: number, search: string) {
  return listEvolutionPreviewIndividuals(sourceCreatureId, search, await actor());
}
export async function previewEvolutionEligibility(characterId: number, pathId: number) {
  return previewEvolutionForActor(characterId, pathId, await actor());
}
