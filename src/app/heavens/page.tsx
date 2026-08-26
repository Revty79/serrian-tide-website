import Link from "next/link";
import { redirect } from "next/navigation";

import { listCampaignsForGod } from "@/app/heavens/campaigns/actions";
import { requireGod } from "@/lib/server-access";

import { HeavensCampaignControl } from "./heavens-campaign-control";

const coreTools = [
  {
    title: "RACES",
    subtitle: "Peoples",
    description: "Create and manage playable Races, attribute caps, movement, quirks, and racial Skills.",
    href: "/heavens/races",
  },
  {
    title: "SKILLS",
    subtitle: "Abilities",
    description: "Manage every Serrian Tide Skill, including magical and specialized abilities.",
    href: "/heavens/skills",
  },
  {
    title: "EQUIPMENT",
    subtitle: "Arsenal",
    description: "Create weapons, armor, and general Equipment with full combat profiles.",
    href: "/heavens/equipment",
  },
  {
    title: "INVENTORY",
    subtitle: "Items",
    description: "Create and manage all non-equipment Inventory content and relationships.",
    href: "/heavens/inventory",
  },
  {
    title: "CREATURES",
    subtitle: "Bestiary",
    description: "Create and manage Creatures, attacks, hit locations, defenses, variants, and CR.",
    href: "/heavens/creatures",
  },
  {
    title: "NPCS",
    subtitle: "Characters",
    description: "Create Race NPCs and independent Creature NPC individuals inside Campaigns.",
    href: "/heavens/npcs",
  },
];

export default async function HeavensPage() {
  const session = await requireGod().catch(() => redirect("/access"));
  const campaigns = await listCampaignsForGod();

  return (
    <main className="relative z-10 min-h-screen px-5 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="grid overflow-hidden rounded-3xl border border-white/10 bg-black/35 shadow-2xl backdrop-blur-md md:grid-cols-[0.9fr_1.1fr]">
          <div className="flex min-h-[180px] items-center justify-center px-8 py-8">
            <Link href="/access" className="text-center">
              <h1 className="font-evanescent bg-gradient-to-r from-purple-500 via-amber-300 to-purple-500 bg-clip-text text-5xl tracking-tight text-transparent drop-shadow-[0_0_18px_rgba(251,191,36,0.28)] sm:text-6xl">
                SERRIAN
                <span className="block">TIDE</span>
              </h1>
            </Link>
          </div>

          <div className="flex flex-col justify-center border-t border-white/10 px-8 py-8 md:border-l md:border-t-0 lg:px-12">
            <p className="text-xs uppercase tracking-[0.3em] text-purple-200">
              G.O.D. Creation Portal
            </p>
            <h2 className="font-portcullion mt-3 bg-gradient-to-r from-slate-100 via-amber-100 to-slate-100 bg-clip-text text-4xl text-transparent sm:text-5xl">
              The Heavens
            </h2>
            <p className="mt-4 text-sm text-slate-400">
              Welcome, <span className="text-amber-200">{session.user.username ?? session.user.name}</span>
              <span className="text-slate-500"> — G.O.D.</span>
            </p>
          </div>
        </header>

        <section className="mt-7 rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-purple-200">Working Context</p>
              <h3 className="font-portcullion mt-2 text-3xl text-slate-100">Campaign Control</h3>
            </div>
            <p className="max-w-md text-sm text-slate-500 sm:text-right">
              Select the Campaign, Player, and Character you are currently working with.
            </p>
          </div>
          <HeavensCampaignControl campaigns={campaigns} />
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-purple-200">Creation Libraries</p>
              <h3 className="font-portcullion mt-2 text-3xl text-slate-100">Create &amp; Manage Serrian Tide</h3>
            </div>
            <p className="text-sm text-slate-500">Build the systems behind the world.</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {coreTools.map((tool) => <LibraryCard key={tool.title} {...tool} />)}
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
          <Link href="/access" className="rounded-full border border-amber-300/40 bg-amber-300/10 px-5 py-2.5 text-sm text-amber-100 backdrop-blur-sm transition hover:border-amber-300/70 hover:bg-amber-300/20">← Return to Paths</Link>
          <span className="hidden text-xs tracking-[0.2em] text-slate-600 sm:block">SERRIAN TIDE</span>
        </footer>
      </div>
    </main>
  );
}

function LibraryCard({
  title,
  subtitle,
  description,
  href,
}: {
  title: string;
  subtitle: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className="group relative block min-h-[160px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-6 shadow-xl backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:bg-black/45 hover:shadow-[0_0_35px_rgba(139,92,246,0.10)]">
      <div className="absolute -bottom-14 -right-14 h-32 w-32 rounded-full border border-purple-400/10 transition duration-300 group-hover:scale-110 group-hover:border-amber-300/20" aria-hidden="true" />
      <span className="absolute right-5 top-4 text-xl text-amber-300/40 transition group-hover:text-amber-300/70" aria-hidden="true">◇</span>
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-purple-300">{subtitle}</p>
      <h4 className="font-portcullion mt-3 text-2xl text-slate-100 transition group-hover:text-amber-200">{title}</h4>
      <p className="mt-3 max-w-[90%] text-sm leading-6 text-slate-400">{description}</p>
      <p className="mt-5 text-xs font-medium tracking-wide text-amber-200/60 transition group-hover:text-amber-200">Creation tools →</p>
    </Link>
  );
}
