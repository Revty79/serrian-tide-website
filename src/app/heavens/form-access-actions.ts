"use server";

import { and, asc, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { skill } from "@/db/skill-schema";
import { derivedAbility } from "@/db/derived-ability-schema";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

/** Active library candidates only; retained archived references are hydrated on the Form. */
export async function listFormAccessReferences(kind: "skill" | "derived-ability", search: string) {
  await requireGodOrAdminAccessContext();
  const query = `%${search.trim().slice(0, 200)}%`;
  if (kind === "skill") return db.select({ id: skill.id, name: skill.name, classification: skill.classification }).from(skill)
    .where(and(isNull(skill.archivedAt), ilike(skill.name, query))).orderBy(asc(skill.name), asc(skill.id)).limit(50);
  if (kind !== "derived-ability") throw new Error("Choose a supported Form Access reference type.");
  return db.select({ id: derivedAbility.id, name: derivedAbility.name }).from(derivedAbility)
    .where(and(isNull(derivedAbility.archivedAt), ilike(derivedAbility.name, query))).orderBy(asc(derivedAbility.name), asc(derivedAbility.id)).limit(50);
}
