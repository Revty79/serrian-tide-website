import type { SerrianRole } from "@/db/authorization-schema";

export type SharedLibraryActor = {
  userId: string;
  roles: readonly SerrianRole[];
};

export type SharedLibraryRootOwnership = {
  createdByUserId: string | null;
  sourceSystem: string | null;
};

export function canAccessSharedLibrary(actor: SharedLibraryActor): boolean {
  return actor.roles.includes("god") || actor.roles.includes("admin");
}

export function isUserCreatedSharedLibraryRoot(
  root: SharedLibraryRootOwnership,
): boolean {
  return root.createdByUserId !== null && !root.sourceSystem?.trim();
}

export function canEditSharedLibraryRoot(
  actor: SharedLibraryActor,
  root: SharedLibraryRootOwnership,
): boolean {
  if (!canAccessSharedLibrary(actor)) return false;

  if (!isUserCreatedSharedLibraryRoot(root)) {
    // Preserve the established G.O.D. master-content authoring boundary for
    // canonical/imported and ambiguous legacy records. Administrator lifecycle
    // override does not silently become canonical authoring authority.
    return actor.roles.includes("god");
  }

  return actor.roles.includes("admin")
    || (actor.roles.includes("god") && root.createdByUserId === actor.userId);
}

export function assertCanEditSharedLibraryRoot(
  actor: SharedLibraryActor,
  root: SharedLibraryRootOwnership,
  label: string,
): void {
  if (!canAccessSharedLibrary(actor)) {
    throw new Error("G.O.D. or administrator access is required.");
  }

  if (!isUserCreatedSharedLibraryRoot(root)) {
    if (!actor.roles.includes("god")) {
      throw new Error(
        `Only a G.O.D. may edit protected canonical, imported, system-owned, or legacy ${label} records.`,
      );
    }
    return;
  }

  if (!canEditSharedLibraryRoot(actor, root)) {
    throw new Error(`Only the ${label} creator or an administrator can edit it.`);
  }
}
