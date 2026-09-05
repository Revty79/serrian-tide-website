"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { assertPreliminaryAdministratorAccess } from "@/features/authorization/admin-roster-lock";
import { setUserRoleInTransaction } from "@/features/authorization/user-role-service";
import { permanentlyDeleteAdminAccount } from "@/features/lifecycle/admin-account-lifecycle-service";
import { auth } from "@/lib/auth";

export type DeleteAdminAccountActionResult =
  | { ok: true; deletedUserId: string }
  | { ok: false; message: string };

export async function setUserRole(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in.");
  }

  await assertPreliminaryAdministratorAccess(session.user.id);
  const targetUserId = formData.get("userId");
  const requestedRole = formData.get("role");
  const enabled = formData.get("enabled");
  await db.transaction((tx) => setUserRoleInTransaction(tx, session.user.id, {
    targetUserId,
    requestedRole,
    enabled,
  }));

  revalidatePath("/admin/users");
  revalidatePath("/access");
}

export async function deleteAdminAccount(
  formData: FormData,
): Promise<DeleteAdminAccountActionResult> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { ok: false, message: "You must be signed in." };
  }

  try {
    const result = await permanentlyDeleteAdminAccount(session.user.id, {
      targetUserId: formData.get("targetUserId"),
      confirmationText: formData.get("confirmationText"),
      reason: formData.get("reason"),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath("/admin/content");
    revalidatePath("/access");
    revalidatePath("/chat");
    revalidatePath("/heavens");
    revalidatePath("/realms");
    return { ok: true, deletedUserId: result.deletedUserId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : "The User account could not be deleted.",
    };
  }
}
