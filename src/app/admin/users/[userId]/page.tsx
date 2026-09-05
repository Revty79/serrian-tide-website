import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAdminUserAccountSummary } from "@/features/authorization/admin-user-account-service";
import { previewAdminAccountDeletion } from "@/features/lifecycle/admin-account-lifecycle-service";
import { requireAdmin } from "@/lib/server-access";

import { AccountDeletionControl } from "./account-deletion-control";

const roleLabels = {
  admin: "ADMIN",
  god: "G.O.D.",
  player: "PLAYER",
} as const;

const summaryCards = [
  { key: "campaignsCreated", label: "Campaigns Created" },
  { key: "campaignsJoined", label: "Campaigns Joined" },
  { key: "playerCharacters", label: "Player Characters" },
  { key: "raceNpcsControlled", label: "Race NPCs Controlled" },
  { key: "creatureNpcsControlled", label: "Creature NPCs Controlled" },
] as const;

export default async function AdminUserAccountPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await requireAdmin().catch(() => redirect("/access"));

  const { userId } = await params;
  const summary = await getAdminUserAccountSummary(userId);

  if (!summary) notFound();

  const deletionPreview = await previewAdminAccountDeletion(session.user.id, userId);

  const { account } = summary;
  const username = account.displayUsername ?? account.username ?? "Not set";

  return (
    <main className="relative z-10 min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="rounded-3xl border border-white/10 bg-black/35 px-7 py-7 shadow-2xl backdrop-blur-md sm:px-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
                Administration / User Account
              </p>
              <h1 className="mt-3 break-words font-sans text-3xl text-slate-100 sm:text-4xl">
                {account.name}
              </h1>
              <p className="mt-2 break-words text-slate-400">{account.email}</p>
            </div>

            <nav className="flex flex-wrap gap-4 text-sm sm:justify-end" aria-label="Admin account navigation">
              <Link
                href="/admin/users"
                className="text-amber-200 transition hover:text-amber-100"
              >
                Back to User Management
              </Link>
              <Link
                href="/admin"
                className="text-slate-300 transition hover:text-slate-100"
              >
                Admin Dashboard
              </Link>
            </nav>
          </div>
        </header>

        <section className="mt-8 rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
                Account Summary
              </p>
              <dl className="mt-5 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">Name</dt>
                  <dd className="mt-1 text-slate-100">{account.name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">Username</dt>
                  <dd className="mt-1 text-slate-100">{username}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">Email</dt>
                  <dd className="mt-1 break-all text-slate-100">{account.email}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">Joined</dt>
                  <dd className="mt-1 text-slate-100">
                    {account.createdAt.toLocaleDateString("en-US", { dateStyle: "long" })}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lg:max-w-sm lg:text-right">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-300">
                Assigned Serrian Tide Roles
              </p>
              {summary.roles.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2 lg:justify-end">
                  {summary.roles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-purple-400/30 bg-purple-500/15 px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-purple-100"
                    >
                      {roleLabels[role]}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No Serrian Tide roles assigned.</p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="account-overview-heading">
          <h2 id="account-overview-heading" className="font-sans text-2xl text-slate-100 sm:text-3xl">
            Overview
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <article
                key={card.key}
                className="rounded-2xl border border-white/10 bg-black/35 p-5 shadow-xl backdrop-blur-md"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
                <p className="mt-3 text-3xl text-amber-200">{summary.counts[card.key]}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <RecordSection
            title="Campaigns Created"
            count={summary.counts.campaignsCreated}
            emptyMessage="No campaigns created."
          >
            {summary.campaignsCreated.map((campaignRecord) => (
              <li key={campaignRecord.id} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-slate-100">
                {campaignRecord.name}
              </li>
            ))}
          </RecordSection>

          <RecordSection
            title="Campaigns Joined"
            count={summary.counts.campaignsJoined}
            emptyMessage="No campaign memberships."
          >
            {summary.campaignsJoined.map((campaignRecord) => (
              <li key={campaignRecord.id} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-slate-100">
                {campaignRecord.name}
              </li>
            ))}
          </RecordSection>

          <RecordSection
            title="Player Characters"
            count={summary.counts.playerCharacters}
            emptyMessage="No player characters."
          >
            {summary.playerCharacters.map((character) => (
              <li key={character.id} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-slate-100">{character.name}</p>
                <p className="mt-1 text-sm text-slate-400">{character.campaignName}</p>
              </li>
            ))}
          </RecordSection>

          <RecordSection
            title="Race NPCs Controlled"
            count={summary.counts.raceNpcsControlled}
            emptyMessage="No race NPCs controlled."
          >
            {summary.raceNpcsControlled.map((character) => (
              <li key={character.id} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-slate-100">{character.name}</p>
                <p className="mt-1 text-sm text-slate-400">{character.campaignName}</p>
              </li>
            ))}
          </RecordSection>

          <RecordSection
            title="Creature NPCs Controlled"
            count={summary.counts.creatureNpcsControlled}
            emptyMessage="No Creature NPCs controlled."
          >
            {summary.creatureNpcsControlled.map((character) => (
              <li key={character.id} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-slate-100">{character.name}</p>
                <p className="mt-1 text-sm text-slate-400">{character.campaignName}</p>
              </li>
            ))}
          </RecordSection>
        </div>

        <AccountDeletionControl preview={deletionPreview} />
      </div>
    </main>
  );
}

function RecordSection({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-7">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 [&::-webkit-details-marker]:hidden">
        <span className="font-sans text-2xl text-slate-100">{title}</span>
        <span className="flex items-center gap-3">
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm text-amber-200">
            {count}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180"
          >
            <path
              d="m5 7.5 5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </span>
      </summary>

      <div className="pt-5">
        {count > 0 ? (
          <ul className="space-y-3">{children}</ul>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
            {emptyMessage}
          </p>
        )}
      </div>
    </details>
  );
}
