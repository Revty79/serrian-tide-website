import { redirect } from "next/navigation";

import { requireGodOrAdminAccessContext } from "@/lib/server-access";

import {
  getRecursiveSkillLibrary,
  getSkillFilterOptions,
  listSkills,
} from "./actions";
import "./skills.css";
import { SkillsWorkspace } from "./skills-workspace";

export default async function SkillsPage() {
  const { session, roles } = await requireGodOrAdminAccessContext()
    .catch(() => redirect("/access"));

  const [initialHierarchy, initialFilterOptions, initialLibrary] = await Promise.all([
    getRecursiveSkillLibrary(),
    getSkillFilterOptions(),
    listSkills({ page: 1, pageSize: 40 }),
  ]);

  return (
    <SkillsWorkspace
      initialHierarchy={initialHierarchy}
      initialFilterOptions={initialFilterOptions}
      canManageCanon={roles.includes("admin")}
      initialLibrary={initialLibrary}
      username={session.user.username ?? session.user.name ?? "G.O.D."}
    />
  );
}
