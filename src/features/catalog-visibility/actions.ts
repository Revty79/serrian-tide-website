"use server";

import { requireSession } from "@/lib/server-access";
import { revalidatePath } from "next/cache";
import { bindCatalogPreferenceOperations } from "./catalog-preference-service";
import { setSystemCanonForActor } from "./system-canon-service";
import { setCatalogActivationForActor } from "./catalog-activation-service";

function refreshCatalogs() {
  revalidatePath("/profile");
  for (const path of ["races", "creatures", "skills", "derived-abilities", "equipment", "inventory", "campaigns", "campaigns/new"]) revalidatePath(`/heavens/${path}`);
}

const preferences = bindCatalogPreferenceOperations(async () => (await requireSession()).user.id);

export async function getCurrentCatalogPreferences() {
  return preferences.read();
}

export async function updateCurrentCatalogPreference(input: unknown) {
  const saved = await preferences.update(input);
  refreshCatalogs();
  return saved;
}

export async function setSystemCanon(input: unknown) {
  const session = await requireSession();
  const saved = await setSystemCanonForActor(session.user.id, input);
  refreshCatalogs();
  return saved;
}

export async function setCatalogActivation(input: unknown) {
  const session = await requireSession();
  const saved = await setCatalogActivationForActor(session.user.id, input);
  refreshCatalogs();
  return saved;
}
