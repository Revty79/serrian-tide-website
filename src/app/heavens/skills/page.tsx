import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

import {
  getSkillFilterOptions,
  listSkills,
} from "./actions";

export default async function SkillsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const godAccess = await db
    .select({
      role: userRole.role,
    })
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

  const [library, filterOptions] =
    await Promise.all([
      listSkills({
        page: 1,
        pageSize: 40,
      }),

      getSkillFilterOptions(),
    ]);

  return (
    <main className="relative z-10 min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs uppercase tracking-[0.3em] text-purple-200">
          The Heavens / Master Content
        </p>

        <h1 className="font-portcullion mt-2 text-4xl text-slate-100">
          Skills
        </h1>

        <p className="mt-3 text-slate-400">
          {library.total.toLocaleString()} shared
          Serrian Tide Skills
        </p>

        <div className="mt-8 rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md">
          <p className="text-sm text-slate-400">
            Database connection verified.
          </p>

          <p className="mt-2 text-2xl text-amber-200">
            {library.items.length} of{" "}
            {library.total.toLocaleString()} Skills
            loaded.
          </p>

          <p className="mt-4 text-sm text-slate-500">
            Classifications:{" "}
            {filterOptions.classifications.length}
            {" · "}
            Tiers: {filterOptions.tiers.join(", ")}
          </p>
        </div>
      </div>
    </main>
  );
}