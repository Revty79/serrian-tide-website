"use client";

import { useId, useMemo, useState } from "react";
import {
  buildCampaignRaceTree,
  type CampaignRaceEntry,
  type CampaignRaceNode,
} from "@/features/campaigns/campaign-race-tree";
import styles from "./campaign-race-selector.module.css";

function countRaces(nodes: CampaignRaceNode[], selected?: ReadonlySet<number>): number {
  return nodes.reduce((total, node) => total
    + Number(node.selectable && (!selected || selected.has(node.race.id)))
    + countRaces(node.children, selected), 0);
}

export function CampaignRaceSelector({
  title, subtitle, races, availableIds, selectedIds, search, onToggle,
}: {
  title: string;
  subtitle: string;
  races: readonly CampaignRaceEntry[];
  availableIds?: readonly number[];
  selectedIds: readonly number[];
  search: string;
  onToggle: (raceId: number) => void;
}) {
  const headingId = useId();
  const nodes = useMemo(() => buildCampaignRaceTree(races, availableIds, search), [races, availableIds, search]);
  const selected = new Set(selectedIds);
  return <section className={styles.column} aria-labelledby={headingId}>
    <header>
      <h4 id={headingId}>{title} <span className={styles.count}>{countRaces(nodes)}</span></h4>
      <p>{subtitle}</p>
    </header>
    {nodes.length ? <ul className={styles.list}>
      {nodes.map((node) => <RaceBranch key={`${node.race.id}:${search.trim().toLowerCase()}`}
        node={node} selected={selected} initiallyOpen={Boolean(search.trim())} onToggle={onToggle} />)}
    </ul> : <p className={styles.empty}>No races match this filter.</p>}
  </section>;
}

function RaceBranch({ node, selected, initiallyOpen, onToggle }: {
  node: CampaignRaceNode;
  selected: ReadonlySet<number>;
  initiallyOpen: boolean;
  onToggle: (raceId: number) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  const { race, children, selectable } = node;
  const checked = selected.has(race.id);
  const selectedVariants = countRaces(children, selected);
  const label = <span className={styles.identity}>
    <strong>{race.name}</strong>
    <small>{race.size || "Size not recorded"}</small>
  </span>;
  return <li className={styles.branch}>
    <div className={`${styles.row} ${selectable && checked ? styles.selected : ""}`}>
      {selectable ? <label className={styles.check}>
        <input id={`${id}-select`} type="checkbox" checked={checked}
          aria-label={`Select ${race.name}`} onChange={() => onToggle(race.id)} />
      </label> : null}
      {children.length ? <button type="button" className={styles.expand}
        aria-expanded={open} aria-controls={`${id}-variants`}
        aria-label={`${open ? "Hide" : "Show"} variants of ${race.name}`} onClick={() => setOpen(!open)}>
        {label}
        <span className={styles.variants}>{children.length} {children.length === 1 ? "variant" : "variants"}
          {selectedVariants ? <small>{selectedVariants} selected</small> : null}
        </span>
        <span aria-hidden="true" className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button> : <label htmlFor={`${id}-select`} className={styles.leaf}>{label}</label>}
    </div>
    {children.length ? <ul id={`${id}-variants`} className={styles.children} hidden={!open}>
      {children.map((child) => <RaceBranch key={child.race.id} node={child} selected={selected}
        initiallyOpen={initiallyOpen} onToggle={onToggle} />)}
    </ul> : null}
  </li>;
}
