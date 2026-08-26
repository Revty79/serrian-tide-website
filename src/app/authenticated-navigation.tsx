"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import {
  getContextNavigationItems,
  getNavigationBreadcrumbs,
  getRoleDestinations,
  isNavigationItemActive,
  type AuthenticatedContext,
  type SerrianAppRole,
} from "@/features/navigation/authenticated-navigation";

const contextNames: Record<AuthenticatedContext, string> = {
  admin: "Administration",
  heavens: "The Heavens",
  realms: "The Realms",
};

export function AuthenticatedNavigation({
  context,
  roles,
  username,
}: {
  context: AuthenticatedContext;
  roles: SerrianAppRole[];
  username: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const navigationItems = getContextNavigationItems(context);
  const roleDestinations = getRoleDestinations(roles);
  const characterSource = searchParams.get("source");
  const breadcrumbs = getNavigationBreadcrumbs(pathname, context, characterSource);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  const links = (
    <>
      {navigationItems.map((item) => {
        const active = isNavigationItemActive(pathname, item, characterSource);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-2 text-xs transition ${
              active
                ? "border-amber-300/45 bg-amber-300/15 text-amber-100"
                : "border-transparent text-slate-400 hover:border-white/15 hover:bg-white/5 hover:text-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[#070a13]/92 shadow-2xl backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/access" className="shrink-0 border-r border-white/10 pr-4">
          <strong className="font-evanescent block bg-gradient-to-r from-purple-400 via-amber-200 to-purple-400 bg-clip-text text-lg text-transparent">
            SERRIAN TIDE
          </strong>
          <span className="mt-0.5 block text-[0.62rem] uppercase tracking-[0.22em] text-purple-200/70">
            {contextNames[context]}
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 lg:flex" aria-label={`${contextNames[context]} navigation`}>
          {links}
        </nav>

        <details className="relative ml-auto lg:hidden">
          <summary className="cursor-pointer list-none rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-slate-200">
            Navigate
          </summary>
          <nav className="absolute right-0 top-12 grid w-[min(88vw,22rem)] gap-1 rounded-2xl border border-white/15 bg-[#080b15] p-3 shadow-2xl" aria-label={`${contextNames[context]} mobile navigation`}>
            {links}
            <span className="mt-2 border-t border-white/10 px-3 pt-3 text-[0.65rem] uppercase tracking-[0.2em] text-purple-200/60">
              Switch Path
            </span>
            <Link href="/access" className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Paths</Link>
            {roleDestinations.map((destination) => (
              <Link key={`mobile-${destination.href}`} href={destination.href} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                {destination.label}
              </Link>
            ))}
          </nav>
        </details>

        <div className="hidden shrink-0 items-center gap-2 border-l border-white/10 pl-4 md:flex">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full border border-purple-300/20 px-3 py-2 text-xs text-purple-100">
              Switch Path
            </summary>
            <div className="absolute right-0 top-11 grid min-w-40 gap-1 rounded-xl border border-white/15 bg-[#080b15] p-2 shadow-2xl">
              <Link href="/access" className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Paths</Link>
              {roleDestinations.map((destination) => (
                <Link key={destination.href} href={destination.href} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                  {destination.label}
                </Link>
              ))}
            </div>
          </details>
          <span className="max-w-28 truncate text-xs text-slate-500" title={username}>{username}</span>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
            className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-400 transition hover:border-red-300/30 hover:text-red-200 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Log Out"}
          </button>
        </div>
      </div>

      <nav className="mx-auto flex w-full max-w-[1500px] items-center gap-2 overflow-x-auto border-t border-white/5 px-4 py-2 text-xs sm:px-6" aria-label="Breadcrumb">
        {breadcrumbs.map((breadcrumb, index) => (
          <span key={`${breadcrumb.href}-${index}`} className="flex shrink-0 items-center gap-2">
            {index > 0 ? <span className="text-slate-700">→</span> : null}
            {breadcrumb.current ? (
              <span className="text-amber-200" aria-current="page">{breadcrumb.label}</span>
            ) : (
              <Link href={breadcrumb.href} className="text-slate-500 transition hover:text-slate-200">{breadcrumb.label}</Link>
            )}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <Link href="/access" className="text-purple-200">Paths</Link>
          <button type="button" disabled={signingOut} onClick={() => void signOut()} className="text-slate-500 hover:text-red-200">
            {signingOut ? "Signing out…" : "Log Out"}
          </button>
        </div>
      </nav>
    </div>
  );
}
