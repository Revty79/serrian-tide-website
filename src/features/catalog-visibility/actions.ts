"use server";

import { requireSession } from "@/lib/server-access";
import { bindCatalogPreferenceOperations } from "./catalog-preference-service";
import { setSystemCanonForActor } from "./system-canon-service";

const preferences = bindCatalogPreferenceOperations(async () => (await requireSession()).user.id);

export async function getCurrentCatalogPreferences() {
  return preferences.read();
}

export async function updateCurrentCatalogPreference(input: unknown) {
  return preferences.update(input);
}

export async function setSystemCanon(input: unknown) {
  const session = await requireSession();
  return setSystemCanonForActor(session.user.id, input);
}
