import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

import { CampaignCreateForm } from "./campaign-create-form";

export default async function NewCampaignPage() {
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

  return (
    <main className="relative z-10 min-h-screen px-5 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header
          className="
            rounded-3xl
            border
            border-white/10
            bg-black/35
            px-7
            py-7
            shadow-2xl
            backdrop-blur-md
            sm:px-9
          "
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link
                href="/heavens"
                className="inline-block"
              >
                <h1
                  className="
                    font-evanescent
                    bg-gradient-to-r
                    from-purple-500
                    via-amber-300
                    to-purple-500
                    bg-clip-text
                    text-4xl
                    tracking-tight
                    text-transparent
                    drop-shadow-[0_0_14px_rgba(251,191,36,0.25)]
                    sm:text-5xl
                  "
                >
                  SERRIAN TIDE
                </h1>
              </Link>

              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-purple-200">
                The Heavens
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-sm text-slate-400">
                G.O.D. Campaign Creation
              </p>

              <p className="mt-1 text-lg text-slate-100">
                {session.user.name}
              </p>
            </div>
          </div>
        </header>

        <section className="mb-7 mt-8">
          <p className="text-xs uppercase tracking-[0.3em] text-purple-200">
            Campaign Control
          </p>

          <h2 className="font-portcullion mt-2 text-4xl text-slate-100">
            Create Campaign
          </h2>

          <p className="mt-3 max-w-3xl text-slate-400">
            Define the mechanical foundation of a new
            Serrian Tide campaign. This campaign will
            belong exclusively to you as its creator.
          </p>
        </section>

        <CampaignCreateForm />
      </div>
    </main>
  );
}