import Link from "next/link";
import { redirect } from "next/navigation";

import type {
  AdminContentCharacterSummary,
  AdminContentStatus,
  AdminContentStatusCounts,
} from "@/features/authorization/admin-content-overview";
import { getAdminContentOverview } from "@/features/authorization/admin-content-overview-service";
import { getDetailedNpcHref, getSimpleNpcHref } from "@/features/npcs/npc-workflow";
import { requireAdmin } from "@/lib/server-access";

const overviewCards = [
  { key: "campaigns", label: "Campaigns" },
  { key: "playerCharacters", label: "Player Characters" },
  { key: "raceNpcs", label: "Race NPCs" },
  { key: "creatureNpcs", label: "Creature NPCs" },
] as const;

export default async function AdminContentPage() {
  await requireAdmin().catch(() => redirect("/access"));
  const overview = await getAdminContentOverview();

  return (
    <main className="relative z-10 min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="rounded-3xl border border-white/10 bg-black/35 px-7 py-7 shadow-2xl backdrop-blur-md sm:px-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
                Administration / Site-wide Content
              </p>
              <h1 className="font-sans mt-3 text-3xl text-slate-100 sm:text-4xl">
                Content Overview
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Site-wide visibility across active and archived Campaign content. Open a record to review or
                manage its persistent content; live Campaign operation remains with the owning G.O.D.
              </p>
            </div>
            <nav className="flex flex-wrap gap-4 text-sm sm:justify-end" aria-label="Admin content navigation">
              <Link href="/admin" className="text-amber-200 transition hover:text-amber-100">
                Admin Dashboard
              </Link>
              <Link href="/heavens" className="text-slate-300 transition hover:text-slate-100">
                The Heavens
              </Link>
            </nav>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="site-content-counts-heading">
          <h2 id="site-content-counts-heading" className="font-sans text-2xl text-slate-100 sm:text-3xl">
            Site Content
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map((card) => {
              const counts = overview.counts[card.key];
              return (
                <article key={card.key} className="rounded-2xl border border-white/10 bg-black/35 p-5 shadow-xl backdrop-blur-md">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
                  <p className="mt-3 text-3xl text-amber-200">{counts.total}</p>
                  <p className="mt-2 text-sm text-slate-400">
                    <span className="text-emerald-200">{counts.active} active</span>
                    <span aria-hidden="true"> · </span>
                    <span className="text-orange-200">{counts.archived} archived</span>
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-7" aria-labelledby="shared-catalog-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-purple-200">Shared Libraries</p>
              <h2 id="shared-catalog-heading" className="font-sans mt-2 text-2xl text-slate-100 sm:text-3xl">
                Catalog Health
              </h2>
            </div>
            <p className="text-sm text-slate-400">Open a library to review its active or archived records.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {overview.sharedCatalogs.map((catalog) => (
              <Link
                key={catalog.key}
                href={catalog.href}
                className="group rounded-2xl border border-white/10 bg-slate-950/45 p-4 transition hover:border-amber-300/40 hover:bg-black/45"
              >
                <p className="text-sm text-slate-100 transition group-hover:text-amber-200">{catalog.label}</p>
                <p className="mt-3 text-2xl text-amber-200">{catalog.total}</p>
                <p className="mt-1 text-xs text-slate-400">{catalog.active} active · {catalog.archived} archived</p>
                <p className="mt-4 text-xs text-purple-200">Open library</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <ContentSection title="Campaigns" counts={overview.counts.campaigns} emptyMessage="No Campaigns found.">
            {overview.campaigns.map((campaign) => (
              <li key={campaign.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg text-slate-100">{campaign.name}</p>
                    <p className="mt-1 text-sm text-slate-400">Owner: {campaign.owner.label}</p>
                  </div>
                  <StatusBadge status={campaign.status} />
                </div>
                {campaign.archiveReason ? <p className="mt-3 text-sm text-orange-100/80">Archive note: {campaign.archiveReason}</p> : null}
                <Link href={`/heavens/campaigns?campaign=${campaign.id}`} className="mt-4 inline-flex text-sm text-amber-200 hover:text-amber-100">
                  Open Campaign settings
                </Link>
              </li>
            ))}
          </ContentSection>

          <ContentSection title="Player Characters" counts={overview.counts.playerCharacters} emptyMessage="No Player Characters found.">
            {overview.playerCharacters.map((character) => (
              <CharacterRecord key={character.id} character={character} kind="player" />
            ))}
          </ContentSection>

          <ContentSection title="Race NPCs" counts={overview.counts.raceNpcs} emptyMessage="No Race NPCs found.">
            {overview.raceNpcs.map((character) => (
              <CharacterRecord key={character.id} character={character} kind="race" />
            ))}
          </ContentSection>

          <ContentSection title="Creature NPCs" counts={overview.counts.creatureNpcs} emptyMessage="No Creature NPCs found.">
            {overview.creatureNpcs.map((character) => (
              <CharacterRecord key={character.id} character={character} kind="creature" />
            ))}
          </ContentSection>
        </div>
      </div>
    </main>
  );
}

function CharacterRecord({
  character,
  kind,
}: {
  character: AdminContentCharacterSummary;
  kind: "player" | "race" | "creature";
}) {
  const href = kind === "player"
    ? `/heavens/characters/${character.id}`
    : character.buildMode === "simple"
      ? getSimpleNpcHref({
          campaignId: character.campaign.id,
          characterId: character.id,
          status: character.status,
        })
      : getDetailedNpcHref({ campaignId: character.campaign.id, characterId: character.id, origin: kind });
  return (
    <li className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg text-slate-100">{character.name}</p>
          {character.roleLabel ? <p className="mt-1 text-sm text-amber-100/80">{character.roleLabel}</p> : null}
        </div>
        <StatusBadge status={character.status} />
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-slate-400">
        <div><dt className="inline text-slate-300">Campaign:</dt> <dd className="inline">{character.campaign.name} ({character.campaign.status})</dd></div>
        <div><dt className="inline text-slate-300">Campaign owner:</dt> <dd className="inline">{character.campaignOwner.label}</dd></div>
        <div><dt className="inline text-slate-300">Controller:</dt> <dd className="inline">{character.controller.label}</dd></div>
        {character.buildMode ? <div><dt className="inline text-slate-300">Build:</dt> <dd className="inline">{character.buildMode}</dd></div> : null}
      </dl>
      {character.archiveReason ? <p className="mt-3 text-sm text-orange-100/80">Archive note: {character.archiveReason}</p> : null}
      <Link href={href} className="mt-4 inline-flex text-sm text-amber-200 hover:text-amber-100">
        Open record
      </Link>
    </li>
  );
}

function StatusBadge({ status }: { status: AdminContentStatus }) {
  return (
    <span className={status === "active"
      ? "rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-emerald-200"
      : "rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-orange-200"}
    >
      {status}
    </span>
  );
}

function ContentSection({
  title,
  counts,
  emptyMessage,
  children,
}: {
  title: string;
  counts: AdminContentStatusCounts;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-7">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-sans block text-2xl text-slate-100">{title}</span>
          <span className="mt-1 block text-sm text-slate-400">{counts.active} active · {counts.archived} archived</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm text-amber-200">{counts.total}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180">
            <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </span>
      </summary>
      <div className="pt-5">
        {counts.total > 0
          ? <ul className="space-y-3">{children}</ul>
          : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">{emptyMessage}</p>}
      </div>
    </details>
  );
}
