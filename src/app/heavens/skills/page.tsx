import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

import {
  getRecursiveSkillLibrary,
  getSkillFilterOptions,
  listSkills,
} from "./actions";
import "./skills.css";
import { SkillsWorkspace } from "./skills-workspace";

export default async function SkillsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const godAccess = await db
    .select({ role: userRole.role })
    .from(userRole)
    .where(
      and(
        eq(userRole.userId, session.user.id),
        eq(userRole.role, "god"),
      ),
    )
    .limit(1);

  if (godAccess.length === 0) {
    redirect("/access");
  }

  const [initialHierarchy, initialFilterOptions, initialLibrary] = await Promise.all([
    getRecursiveSkillLibrary(),
    getSkillFilterOptions(),
    listSkills({ page: 1, pageSize: 40 }),
  ]);

  return (
    <SkillsWorkspace
      initialHierarchy={initialHierarchy}
      initialFilterOptions={initialFilterOptions}
      initialLibrary={initialLibrary}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
