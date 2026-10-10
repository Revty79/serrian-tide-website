"use server";

import { revalidatePath } from "next/cache";
import { replacePasswordRecoveryCodes } from "@/features/authorization/password-recovery-service";
import { requireSession } from "@/lib/server-access";

export async function generatePasswordRecoveryCodes(currentPassword: string): Promise<
  { ok: true; codes: string[] } | { ok: false; message: string }
> {
  try {
    const session = await requireSession();
    if (typeof currentPassword !== "string") return { ok: false, message: "Enter your current password." };
    const codes = await replacePasswordRecoveryCodes(session.user.id, session.session.id, currentPassword);
    revalidatePath("/profile");
    return { ok: true, codes };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to generate recovery codes." };
  }
}
