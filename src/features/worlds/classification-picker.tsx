"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import type { TagReference } from "./history";
import styles from "./classification-picker.module.css";

/** Reuses setting classifications without presenting them as historical ages. */
export function ClassificationPicker({ tags, selected, onChange }: {
  tags: TagReference[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<"Era" | "Genre">("Genre");
  const [query, setQuery] = useState("");
  const catalog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) catalog.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [open, selected.length]);
  const chosen = tags.filter((tag) => selected.includes(tag.id));
  const matching = tags.filter((tag) => tag.tagGroup.trim().toLowerCase() === group.toLowerCase()
    && `${tag.name} ${tag.description}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <section className={styles.picker} aria-labelledby={`${id}-heading`}>
    <div className={styles.heading}>
      <div>
        <h3 id={`${id}-heading`}>Era & Genre</h3>
        <p>Optional setting labels. Historical ages live in History.</p>
      </div>
      <button type="button" className={styles.browse} aria-expanded={open} aria-controls={`${id}-catalog`} onClick={() => setOpen(!open)}>
        {open ? <X size={15} /> : <Plus size={15} />}
        {open ? "Done" : "Choose"}
      </button>
    </div>

    {chosen.length > 0 ? <div className={styles.selection}>
      {(["Era", "Genre"] as const).map((kind) => {
        const values = chosen.filter((tag) => tag.tagGroup.trim().toLowerCase() === kind.toLowerCase());
        return values.length > 0 && <div className={styles.selectedGroup} key={kind}>
          <span className={styles.groupLabel}>{kind}</span>
          <div className={styles.chips}>{values.map((tag) => <button type="button" className={styles.selectedChip} key={tag.id} onClick={() => onChange(selected.filter((value) => value !== tag.id))} aria-label={`Remove ${tag.name} classification`}>
            {tag.name}<X size={13} aria-hidden="true" />
          </button>)}</div>
        </div>;
      })}
    </div> : !open && <p className={styles.empty}>Choose the setting’s era or genre when you’re ready.</p>}

    {open && <div ref={catalog} id={`${id}-catalog`} className={styles.catalog}>
      <div className={styles.tools}>
        <div className={styles.groups} role="group" aria-label="Classification group">
          {(["Genre", "Era"] as const).map((kind) => <button type="button" key={kind} aria-pressed={group === kind} onClick={() => {setGroup(kind); setQuery("");}}>{kind}</button>)}
        </div>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder={`Find a ${group.toLowerCase()}…`} aria-label="Search classifications" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className={styles.options} role="group" aria-label={`Available ${group} classifications`}>
        {matching.map((tag) => <button type="button" key={tag.id} aria-pressed={selected.includes(tag.id)} title={tag.description} disabled={selected.length >= 40 && !selected.includes(tag.id)} onClick={() => onChange(selected.includes(tag.id) ? selected.filter((value) => value !== tag.id) : [...selected, tag.id])}>
          {selected.includes(tag.id) ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}<span>{tag.name}</span>
        </button>)}
        {!matching.length && <p>{query ? "No matching classifications." : `No ${group.toLowerCase()} labels are available yet. These are optional.`}</p>}
      </div>
      {selected.length >= 40 && <p className={styles.limit} role="status">You can select up to 40 classifications.</p>}
    </div>}
  </section>;
}
