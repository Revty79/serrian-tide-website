"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Backpack, Bell, BookOpen, Dices, HeartPulse, History, Map, Sparkles, Store, Swords } from "lucide-react";

import { PLAYER_TABLETOP_TABS, playerTabletopRequestAnchor, resolvePlayerTabletopTab, type PlayerTabletopAlert, type PlayerTabletopTab } from "@/features/tabletop-operations/player-tabletop-navigation";
import styles from "./player-tabletop.module.css";

const TabContext = createContext<PlayerTabletopTab>("alerts");
const icons = { alerts: Bell, table: Map, rolls: Dices, status: HeartPulse, equipment: Backpack, spells: BookOpen, abilities: Sparkles, history: History, shop: Store };

export function PlayerTabletopPanel({ id, children }: { id: PlayerTabletopTab; children: ReactNode }) {
  const active = useContext(TabContext);
  return <div id={`tabletop-panel-${id}`} role="tabpanel" aria-labelledby={`tabletop-tab-${id}`} hidden={active !== id} tabIndex={0} className={styles.tabPanel}>{children}</div>;
}

export function PlayerTabletopTabs({ characterId, alerts, hasShop, children, sourceRequests, sourceRequestCount = 0 }: {
  characterId: number;
  alerts: readonly PlayerTabletopAlert[];
  hasShop: boolean;
  children: ReactNode;
  sourceRequests?: ReactNode;
  sourceRequestCount?: number;
}) {
  const searchParams = useSearchParams();
  const active = resolvePlayerTabletopTab(searchParams.get("tab"), hasShop, hasShop ? "shop" : "alerts");
  const requestKey = searchParams.get("request");
  const tabs = PLAYER_TABLETOP_TABS.filter(({ id }) => id !== "shop" || hasShop);
  const rollCount = alerts.filter(({ requiresInput }) => requiresInput).length;

  useEffect(() => {
    if (active !== "rolls") return;
    const anchor = playerTabletopRequestAnchor(requestKey);
    if (!anchor) return;
    const target = document.getElementById(anchor);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [active, requestKey]);

  function selectTab(id: PlayerTabletopTab, request?: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("character", String(characterId));
    url.searchParams.set("tab", id);
    url.searchParams.delete("combat");
    if (request) url.searchParams.set("request", request);
    else url.searchParams.delete("request");
    url.hash = "";
    // Native history keeps the mounted forms intact and supports Back/Forward.
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next].id);
    document.getElementById(`tabletop-tab-${tabs[next].id}`)?.focus();
  }

  function openRequest(event: MouseEvent<HTMLAnchorElement>, alert: PlayerTabletopAlert) {
    if (!alert.requestKey || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectTab("rolls", alert.requestKey);
  }

  return <TabContext.Provider value={active}>
    <div className={styles.tabList} role="tablist" aria-label="Tabletop sections">
      {tabs.map(({ id, label }, index) => {
        const Icon = icons[id];
        const count = id === "alerts" ? alerts.length + sourceRequestCount : id === "rolls" ? rollCount : 0;
        return <button key={id} type="button" role="tab" id={`tabletop-tab-${id}`} aria-controls={`tabletop-panel-${id}`} aria-selected={active === id} tabIndex={active === id ? 0 : -1} onClick={() => selectTab(id)} onKeyDown={(event) => navigateTabs(event, index)}>
          <Icon size={17} aria-hidden="true" /><span>{label}</span>
          {id === "alerts" || id === "rolls" ? <span className={styles.tabBadge} data-empty={count === 0}>{count}</span> : null}
        </button>;
      })}
    </div>
    <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{alerts.length + sourceRequestCount} table alerts. {rollCount} rolls waiting for you.</p>
    <PlayerTabletopPanel id="alerts">
      <section className={styles.section} aria-labelledby="tabletop-alerts-title">
        <header className={styles.sectionHeader}><h2 id="tabletop-alerts-title">Alerts</h2><span className={styles.alertCount}>{alerts.length + sourceRequestCount} active</span></header>
        {alerts.length ? <ul className={styles.alertList}>{alerts.map((alert) => {
          const Icon = alert.kind === "encounter" ? Swords : Dices;
          return <li key={alert.key}>
            <Icon className={styles.alertIcon} size={21} aria-hidden="true" />
            <div><h3>{alert.title}</h3><p>{alert.detail}</p></div>
            <a href={alert.href} onClick={(event) => openRequest(event, alert)} className={styles.alertAction}>{alert.actionLabel}<ArrowRight size={16} aria-hidden="true" /></a>
          </li>;
        })}</ul> : sourceRequestCount ? null : <p className={styles.emptyCopy}>No active encounters or pending table requests.</p>}
        {sourceRequests}
        {hasShop ? <Link className={styles.shopTabLink} href={`/realms/tabletop?character=${characterId}&tab=shop`}><Store size={17} aria-hidden="true" />Return to Shop<ArrowRight size={16} aria-hidden="true" /></Link> : null}
      </section>
    </PlayerTabletopPanel>
    {children}
  </TabContext.Provider>;
}
