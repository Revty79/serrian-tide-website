"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { setUserRoleInTransaction } from "@/features/authorization/user-role-service";
import { auth } from "@/lib/auth";

export async function setUserRole(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in.");
  }

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
