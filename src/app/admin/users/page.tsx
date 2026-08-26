import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  userRole,
  type SerrianRole,
} from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

import { setUserRole } from "./actions";

const roleLabels: Record<SerrianRole, string> = {
  admin: "ADMIN",
  god: "G.O.D.",
  player: "PLAYER",
};

const allRoles: SerrianRole[] = [
  "admin",
  "god",
  "player",
];

export default async function AdminUsersPage() {
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

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      displayUsername: user.displayUsername,
      email: user.email,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));

  const assignedRoles = await db
    .select({
      userId: userRole.userId,
      role: userRole.role,
    })
    .from(userRole);

  const rolesByUser = new Map<string, SerrianRole[]>();

  for (const entry of assignedRoles) {
    const existing = rolesByUser.get(entry.userId) ?? [];
    existing.push(entry.role);
    rolesByUser.set(entry.userId, existing);
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
              <Link href="/admin" className="inline-block">
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

              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-purple-200">
                Administration
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-sm text-slate-400">
                {users.length} registered{" "}
                {users.length === 1 ? "account" : "accounts"}
              </p>

              <Link
                href="/admin"
                className="mt-2 inline-block text-sm text-amber-200 transition hover:text-amber-100"
              >
                ← Admin Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div>
            <h2 className="font-sans text-3xl text-slate-100 sm:text-4xl">
              User Management
            </h2>

            <p className="mt-2 max-w-2xl text-slate-400">
              Manage registered Serrian Tide accounts and control access to
              Administration, The Heavens, and The Realms.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            {users.map((account) => {
              const roles = rolesByUser.get(account.id) ?? [];
              const isCurrentUser = account.id === session.user.id;

              return (
                <article
                  key={account.id}
                  className="
                    rounded-3xl
                    border
                    border-white/10
                    bg-black/35
                    p-6
                    shadow-2xl
                    backdrop-blur-md
                    sm:p-7
                  "
                >
                  <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-sans text-2xl text-slate-100">
                          {account.name}
                        </h3>

                        {isCurrentUser && (
                          <span
                            className="
                              rounded-full
                              border
                              border-amber-300/30
                              bg-amber-300/10
                              px-3
                              py-1
                              text-xs
                              tracking-[0.15em]
                              text-amber-200
                            "
                          >
                            YOU
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1 text-sm text-slate-400">
                        <p>
                          <span className="text-slate-300">
                            Username:
                          </span>{" "}
                          {account.displayUsername ??
                            account.username ??
                            "Not set"}
                        </p>

                        <p>
                          <span className="text-slate-300">
                            Email:
                          </span>{" "}
                          {account.email}
                        </p>

                        <p>
                          <span className="text-slate-300">
                            Joined:
                          </span>{" "}
                          {account.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="lg:min-w-[370px] lg:text-right">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-300">
                        Access Permissions
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3 lg:justify-end">
                        {allRoles.map((role) => {
                          const hasRole = roles.includes(role);

                          const ownAdminLock =
                            isCurrentUser &&
                            role === "admin" &&
                            hasRole;

                          if (ownAdminLock) {
                            return (
                              <div
                                key={role}
                                className="
                                  rounded-full
                                  border
                                  border-amber-300/40
                                  bg-amber-300/15
                                  px-4
                                  py-2
                                  text-xs
                                  font-medium
                                  tracking-[0.15em]
                                  text-amber-200
                                "
                                title="You cannot remove your own administrator access."
                              >
                                {roleLabels[role]} ✓
                              </div>
                            );
                          }

                          return (
                            <form
                              key={role}
                              action={setUserRole}
                            >
                              <input
                                type="hidden"
                                name="userId"
                                value={account.id}
                              />

                              <input
                                type="hidden"
                                name="role"
                                value={role}
                              />

                              <input
                                type="hidden"
                                name="enabled"
                                value={hasRole ? "false" : "true"}
                              />

                              <button
                                type="submit"
                                className={
                                  hasRole
                                    ? `
                                      rounded-full
                                      border
                                      border-purple-400/40
                                      bg-purple-500/20
                                      px-4
                                      py-2
                                      text-xs
                                      font-medium
                                      tracking-[0.15em]
                                      text-purple-100
                                      transition
                                      hover:border-red-300/50
                                      hover:bg-red-500/10
                                      hover:text-red-200
                                    `
                                    : `
                                      rounded-full
                                      border
                                      border-white/10
                                      bg-black/30
                                      px-4
                                      py-2
                                      text-xs
                                      font-medium
                                      tracking-[0.15em]
                                      text-slate-300
                                      transition
                                      hover:border-amber-300/40
                                      hover:bg-amber-300/10
                                      hover:text-amber-200
                                    `
                                }
                                title={
                                  hasRole
                                    ? `Remove ${roleLabels[role]} access`
                                    : `Grant ${roleLabels[role]} access`
                                }
                              >
                                {roleLabels[role]}{" "}
                                {hasRole ? "✓" : "+"}
                              </button>
                            </form>
                          );
                        })}
                      </div>

                      {roles.length === 0 && (
                        <p className="mt-3 text-sm text-slate-300">
                          This account currently has no Serrian Tide access.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}