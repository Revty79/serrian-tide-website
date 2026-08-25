"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  serrianRole,
  userRole,
  type SerrianRole,
} from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

export async function setUserRole(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in.");
  }

  // Confirm the person performing the action is really an admin.
  const adminAccess = await db
    .select({
      role: userRole.role,
    })
    .from(userRole)
    .where(
      and(
        eq(userRole.userId, session.user.id),
        eq(userRole.role, "admin"),
      ),
    )
    .limit(1);

  if (adminAccess.length === 0) {
    throw new Error("Administrator access is required.");
  }

  const targetUserId = formData.get("userId");
  const requestedRole = formData.get("role");
  const enabled = formData.get("enabled");

  if (
    typeof targetUserId !== "string" ||
    typeof requestedRole !== "string" ||
    typeof enabled !== "string"
  ) {
    throw new Error("Invalid role request.");
  }

  if (
    !serrianRole.enumValues.includes(
      requestedRole as SerrianRole,
    )
  ) {
    throw new Error("Invalid Serrian Tide role.");
  }

  const role = requestedRole as SerrianRole;
  const shouldEnable = enabled === "true";

  /*
   * Safety rule:
   * Do not allow an admin to accidentally remove their own
   * administrator access from this screen.
   */
  if (
    targetUserId === session.user.id &&
    role === "admin" &&
    !shouldEnable
  ) {
    throw new Error(
      "You cannot remove your own administrator access.",
    );
  }

  if (shouldEnable) {
    await db
      .insert(userRole)
      .values({
        userId: targetUserId,
        role,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userRole)
      .where(
        and(
          eq(userRole.userId, targetUserId),
          eq(userRole.role, role),
        ),
      );
  }

  revalidatePath("/admin/users");
  revalidatePath("/access");
}