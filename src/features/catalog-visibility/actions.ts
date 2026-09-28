"use server";

import { requireSession } from "@/lib/server-access";
import { revalidatePath } from "next/cache";
import { bindCatalogPreferenceOperations } from "./catalog-preference-service";
import { setSystemCanonForActor } from "./system-canon-service";

const preferences = bindCatalogPreferenceOperations(async () => (await requireSession()).user.id);

export async function getCurrentCatalogPreferences() {
  return preferences.read();
}

export async function updateCurrentCatalogPreference(input: unknown) {
  const saved = await preferences.update(input);
  revalidatePath("/profile");
  for (const path of ["races", "creatures", "skills", "derived-abilities"]) revalidatePath(`/heavens/${path}`);
  return saved;
}

export async function setSystemCanon(input: unknown) {
  const session = await requireSession();
  const saved = await setSystemCanonForActor(session.user.id, input);
  for (const path of ["races", "creatures", "skills", "derived-abilities"]) revalidatePath(`/heavens/${path}`);
  return saved;
}
