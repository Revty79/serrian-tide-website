import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

const adminSections = [
  {
    title: "USER MANAGEMENT",
    subtitle: "Accounts",
    description:
      "View Serrian Tide users and manage their access to the system.",
    href: "/admin/users",
  },
  {
    title: "ROLE MANAGEMENT",
    subtitle: "Permissions",
    description:
      "Assign and remove Admin, G.O.D., and Player capabilities.",
    href: null,
  },
  {
    title: "SYSTEM OVERVIEW",
    subtitle: "Administration",
    description:
      "Review the health and configuration of the Serrian Tide system.",
    href: null,
  },
];

export default async function AdminPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

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
    redirect("/access");
  }

  return (
    <main className="relative z-10 min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-7xl">
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
              <Link href="/access" className="inline-block">
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
                Administration
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-sm text-slate-400">Signed in as</p>

              <p className="mt-1 text-lg text-slate-100">
                {session.user.name}
              </p>

              <Link
                href="/access"
                className="mt-2 inline-block text-sm text-amber-200 transition hover:text-amber-100"
              >
                Return to Access
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div>
            <h2 className="font-portcullion text-3xl text-slate-100 sm:text-4xl">
              Admin Dashboard
            </h2>

            <p className="mt-2 max-w-2xl text-slate-400">
              Manage the accounts and permissions that control access to
              Serrian Tide.
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {adminSections.map((section) =>
              section.href ? (
                <Link
                  key={section.title}
                  href={section.href}
                  className="
                    group
                    flex
                    min-h-[250px]
                    flex-col
                    justify-between
                    rounded-3xl
                    border
                    border-white/10
                    bg-black/35
                    p-7
                    shadow-2xl
                    backdrop-blur-md
                    transition
                    duration-300
                    hover:-translate-y-1
                    hover:border-amber-300/40
                    hover:bg-black/45
                    hover:shadow-[0_0_40px_rgba(139,92,246,0.12)]
                  "
                >
                  <div>
                    <span
                      className="
                        inline-flex
                        rounded-full
                        border
                        border-purple-400/20
                        bg-purple-500/10
                        px-3
                        py-1
                        text-xs
                        tracking-[0.2em]
                        text-purple-200
                      "
                    >
                      {section.subtitle}
                    </span>

                    <h3
                      className="
                        font-portcullion
                        mt-6
                        text-2xl
                        text-slate-100
                        transition
                        group-hover:text-amber-200
                      "
                    >
                      {section.title}
                    </h3>

                    <p className="mt-4 leading-7 text-slate-400">
                      {section.description}
                    </p>
                  </div>

                  <p className="mt-8 text-sm text-amber-200">
                    Open Management →
                  </p>
                </Link>
              ) : (
                <article
                  key={section.title}
                  className="
                    flex
                    min-h-[250px]
                    flex-col
                    justify-between
                    rounded-3xl
                    border
                    border-white/10
                    bg-black/35
                    p-7
                    shadow-2xl
                    backdrop-blur-md
                  "
                >
                  <div>
                    <span
                      className="
                        inline-flex
                        rounded-full
                        border
                        border-purple-400/20
                        bg-purple-500/10
                        px-3
                        py-1
                        text-xs
                        tracking-[0.2em]
                        text-purple-200
                      "
                    >
                      {section.subtitle}
                    </span>

                    <h3 className="font-portcullion mt-6 text-2xl text-slate-100">
                      {section.title}
                    </h3>

                    <p className="mt-4 leading-7 text-slate-400">
                      {section.description}
                    </p>
                  </div>

                  <p className="mt-8 text-sm text-slate-600">
                    Management tools will appear here.
                  </p>
                </article>
              ),
            )}
          </div>
        </section>
      </div>
    </main>
  );
}