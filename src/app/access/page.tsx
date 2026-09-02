import Link from "next/link";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import {
  getAccessDestinationCards,
} from "@/features/navigation/access-directory";

import styles from "./access.module.css";

export default async function AccessPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const assignedRoles = await db
    .select({
      role: userRole.role,
    })
    .from(userRole)
    .where(eq(userRole.userId, session.user.id));

  const availableOptions = getAccessDestinationCards(
    assignedRoles.map((entry) => entry.role),
  );

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-6xl">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <h1
              className="
                font-evanescent
                bg-gradient-to-r
                from-purple-500
                via-amber-300
                to-purple-500
                bg-clip-text
                text-5xl
                tracking-tight
                text-transparent
                drop-shadow-[0_0_16px_rgba(251,191,36,0.25)]
                sm:text-6xl
              "
            >
              SERRIAN TIDE
            </h1>
          </Link>

          <h2 className="font-sans mt-8 text-3xl text-slate-100 sm:text-4xl">
            Choose Your Path
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            Welcome, {session.user.name}. Choose the path you wish to enter.
          </p>
        </div>

        {availableOptions.length > 0 ? (
          <div className={styles.cardGrid} data-card-count={availableOptions.length}>
            {availableOptions.map((option) => (
              <Link
                key={option.key}
                href={option.href}
                className="
                  group
                  flex
                  min-h-[300px]
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
                  <div
                    className="
                      mb-6
                      inline-flex
                      rounded-full
                      border
                      border-purple-400/20
                      bg-purple-500/10
                      px-3
                      py-1
                      text-xs
                      tracking-[0.14em]
                      text-purple-200
                    "
                  >
                    {option.subtitle}
                  </div>

                  <h3
                    className="
                      font-sans
                      text-3xl
                      text-slate-100
                      transition
                      group-hover:text-amber-200
                    "
                  >
                    {option.title}
                  </h3>

                  <p className="mt-5 leading-7 text-slate-400">
                    {option.description}
                  </p>
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <span className="text-sm font-medium text-amber-200">
                    Enter
                  </span>

                  <span
                    className="
                      text-xl
                      text-amber-200
                      transition
                      group-hover:translate-x-1
                    "
                  >
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div
            className="
              mx-auto
              mt-10
              max-w-xl
              rounded-3xl
              border
              border-white/10
              bg-black/35
              p-8
              text-center
              shadow-2xl
              backdrop-blur-md
            "
          >
            <h3 className="font-sans text-2xl text-slate-100">
              No Access Assigned
            </h3>

            <p className="mt-3 text-sm text-slate-400">
              Your account does not currently have access to a Serrian Tide
              destination.
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="text-sm text-slate-400 transition hover:text-amber-200"
          >
            ← Return to login
          </Link>
        </div>
      </section>
    </main>
  );
}
