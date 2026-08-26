import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { auth } from "@/lib/auth";

const coreTools = [
  {
    title: "RACES",
    subtitle: "Peoples",
    description: "Create and manage playable races.",
  },
  {
    title: "SKILLS",
    subtitle: "Abilities",
    description:
      "Manage every Serrian Tide skill, including magical and specialized abilities.",
    href: "/heavens/skills",
  },
  {
    title: "EQUIPMENT",
    subtitle: "Arsenal",
    description: "Create weapons, armor, and equipment.",
  },
  {
    title: "INVENTORY",
    subtitle: "Items",
    description:
      "Shape the general inventory content available within Serrian Tide.",
  },
  {
    title: "CREATURES",
    subtitle: "Bestiary",
    description: "Create and manage creatures within Serrian Tide.",
  },
  {
    title: "NPCS",
    subtitle: "Characters",
    description: "Create and manage non-player characters.",
  },
];

export default async function HeavensPage() {
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
              Welcome,{" "}
              <span className="text-amber-200">{session.user.name}</span>
              <span className="text-slate-500"> — G.O.D.</span>
            </p>
          </div>
        </header>

        <section className="mt-7 rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-purple-200">
                Working Context
              </p>
              <h3 className="font-portcullion mt-2 text-3xl text-slate-100">
                Campaign Control
              </h3>
            </div>

            <p className="max-w-md text-sm text-slate-500 sm:text-right">
              Select the campaign, player, and character you are currently working with.
            </p>
          </div>

          <div className="mt-3">
            <ControlRow
              label="Campaign"
              placeholder="No Campaign Selected"
              buttons={["View Campaign", "Create Campaign"]}
            />
            <ControlRow
              label="Player"
              placeholder="Select a Campaign First"
              buttons={["Add Player"]}
            />
            <ControlRow
              label="Character"
              placeholder="Select a Player First"
              buttons={["New Character", "Edit Character"]}
              last
            />
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-purple-200">
                Creation Libraries
              </p>
              <h3 className="font-portcullion mt-2 text-3xl text-slate-100">
                Create &amp; Manage Serrian Tide
              </h3>
            </div>

            <p className="text-sm text-slate-500">Build the systems behind the world.</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {coreTools.map((tool) => (
              <LibraryCard key={tool.title} {...tool} />
            ))}
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
          <Link
            href="/access"
            className="rounded-full border border-amber-300/40 bg-amber-300/10 px-5 py-2.5 text-sm text-amber-100 backdrop-blur-sm transition hover:border-amber-300/70 hover:bg-amber-300/20"
          >
            ← Return to Paths
          </Link>

          <span className="hidden text-xs tracking-[0.2em] text-slate-600 sm:block">
            SERRIAN TIDE
          </span>
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
  href?: string;
}) {
  const content = (
    <>
      <div
        className="absolute -bottom-14 -right-14 h-32 w-32 rounded-full border border-purple-400/10 transition duration-300 group-hover:scale-110 group-hover:border-amber-300/20"
        aria-hidden="true"
      />

      <span
        className="absolute right-5 top-4 text-xl text-amber-300/40 transition group-hover:text-amber-300/70"
        aria-hidden="true"
      >
        ◇
      </span>

      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-purple-300">
        {subtitle}
      </p>

      <h4 className="font-portcullion mt-3 text-2xl text-slate-100 transition group-hover:text-amber-200">
        {title}
      </h4>

      <p className="mt-3 max-w-[90%] text-sm leading-6 text-slate-400">
        {description}
      </p>

      <p className="mt-5 text-xs font-medium tracking-wide text-amber-200/60 transition group-hover:text-amber-200">
        Creation tools →
      </p>
    </>
  );

  const classes =
    "group relative block min-h-[160px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-6 shadow-xl backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:bg-black/45 hover:shadow-[0_0_35px_rgba(139,92,246,0.10)]";

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return <article className={classes}>{content}</article>;
}

function ControlRow({
  label,
  placeholder,
  buttons,
  last = false,
}: {
  label: string;
  placeholder: string;
  buttons: string[];
  last?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 py-4 sm:grid-cols-[110px_minmax(0,1fr)] lg:grid-cols-[110px_minmax(0,1fr)_auto] lg:items-center ${
        last ? "" : "border-b border-white/10"
      }`}
    >
      <label className="font-portcullion text-lg text-slate-200">{label}</label>

      <select
        disabled
        defaultValue=""
        className="h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-400 outline-none backdrop-blur-sm disabled:cursor-default"
      >
        <option value="">{placeholder}</option>
      </select>

      <div className="flex flex-wrap gap-2 sm:col-start-2 lg:col-start-auto lg:justify-end">
        {buttons.map((button) => (
          <button
            key={button}
            type="button"
            disabled
            className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 text-sm text-amber-100/70 opacity-70 backdrop-blur-sm"
          >
            {button}
          </button>
        ))}
      </div>
    </div>
  );
}
