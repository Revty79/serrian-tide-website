"use client";

import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { getPageHelp, pageHelpTopics } from "@/features/guidance/page-help";
import styles from "./page-guidance.module.css";

export function PageGuidance() {
  const pathname = usePathname();
  // Remount on navigation so an open guide cannot describe the previous page.
  return <PageGuide key={pathname} pathname={pathname} />;
}

function PageGuide({ pathname }: { pathname: string }) {
  const guide = getPageHelp(pathname);
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const id = useId();
  const query = search.trim().toLocaleLowerCase();
  const topics = pageHelpTopics(guide).filter(([name, text]) => !query || `${name} ${text}`.toLocaleLowerCase().includes(query));
  return <aside className={styles.bar} aria-label="Page guidance">
    <button type="button" className={styles.open} onClick={() => dialog.current?.showModal()}><span aria-hidden="true">?</span> Help with this page</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
      }
    }}>
      <header className={styles.header}><h2 id={`${id}-title`}>{guide.title}</h2><form method="dialog"><button className="st-button" type="submit" autoFocus>Close help</button></form></header>
      <p>{guide.introduction}</p>
      <p>G.O.D. means the person running your game.</p>
      <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <label className="st-field" htmlFor={`${id}-search`}>Find a field or topic<input className="st-control" id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="For example: Soak, Initiative, Save" /></label>
      <div className={styles.topics}>{topics.map(([name, text]) => <section key={name}><h3>{name}</h3><p>{text}</p></section>)}</div>
      {!topics.length ? <p role="status">No matching topic on this page. Try a shorter term. For an unresolved tabletop rule, ask the G.O.D.</p> : null}
    </dialog>
  </aside>;
}
