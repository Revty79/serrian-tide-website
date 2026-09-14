"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import styles from "./player-tabletop.module.css";

export function PlayerTabletopCampaign({ name, overview }: { name: string; overview: string }) {
  const [expanded, setExpanded] = useState(false);

  return <details className={styles.campaignOverview} open={expanded}>
    <summary onClick={(event) => { event.preventDefault(); setExpanded((value) => !value); }}>
      <div><span>Campaign</span><h3>{name}</h3></div>
      <ChevronDown size={20} aria-hidden="true" />
    </summary>
    <p>{overview || "No Campaign overview has been provided."}</p>
  </details>;
}
