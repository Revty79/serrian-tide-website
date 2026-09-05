"use server";

import { previewTabletopLifecycleEntityForActor } from "@/features/lifecycle/tabletop-lifecycle-service";
import type {
  TabletopLifecyclePreview,
  TabletopLifecycleTargetInput,
} from "@/features/lifecycle/tabletop-lifecycle-types";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export async function previewTabletopLifecycleEntity(
  target: TabletopLifecycleTargetInput,
): Promise<TabletopLifecyclePreview> {
  const access = await requireGodOrAdminAccessContext();
  return previewTabletopLifecycleEntityForActor(target, {
    userId: access.session.user.id,
    roles: access.roles,
  });
}
