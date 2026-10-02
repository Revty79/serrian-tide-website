"use client";

import { useMemo, useState } from "react";
import type { CampaignSystem } from "@/db/campaign-schema";
import { createCampaignSkillAccess, type CampaignSkillExclusion } from "@/features/campaigns/campaign-skill-access";
import type { RecursiveSkillLibrary, RecursiveSkillPath } from "@/features/skills/recursive-skill-library";
import { CORE_SKILL_ATTRIBUTES } from "@/app/heavens/skills/skill-attributes";
import "./campaign-skill-selector.css";

export function CampaignSkillSelector({ library, allowedSystems, exclusions, onChange, disabled = false }: {
  library: RecursiveSkillLibrary;
  allowedSystems: readonly CampaignSystem[];
  exclusions: readonly CampaignSkillExclusion[];
  onChange: (exclusions: CampaignSkillExclusion[]) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const access = useMemo(() => createCampaignSkillAccess(library, allowedSystems, exclusions), [library, allowedSystems, exclusions]);
  const children = useMemo(() => {
    const map = new Map<string, RecursiveSkillPath[]>();
    for (const path of library.paths) {
      const parent = path.rootToEndpointIds.slice(0, -1).join(">");
      map.set(parent, [...(map.get(parent) ?? []), path]);
    }
    return map;
  }, [library]);
  const nodes = useMemo(() => new Map(library.skills.map(node => [node.id, node])), [library]);
  const groups = useMemo(() => {
    const roots = children.get("") ?? [];
    const special = (path: RecursiveSkillPath) => ["special ability", "special abilities"].includes(nodes.get(path.endpointSkillId)?.classification.trim().toLowerCase() ?? "");
    return [
      ...library.attributeGroups.map(group => ({ key: group.key, label: CORE_SKILL_ATTRIBUTES.find(row => row.value === group.key)?.label ?? (group.key === "REVIEW_REQUIRED" ? "Other / Unlinked" : group.label), roots: roots.filter(path => path.attributeGroupKey === group.key && !special(path)) })),
      { key: "SPECIAL", label: "Special Abilities", roots: roots.filter(special) },
    ].filter(group => group.roots.length);
  }, [library, children, nodes]);
  const matchingPaths = useMemo(() => {
    if (!search.trim()) return null;
    const keys = new Set<string>();
    for (const path of library.paths) if (path.rootToEndpointNames.at(-1)?.toLowerCase().includes(search.trim().toLowerCase())) {
      for (let length = 1; length <= path.rootToEndpointIds.length; length++) keys.add(path.rootToEndpointIds.slice(0, length).join(">"));
    }
    return keys;
  }, [library, search]);
  function branch(path: RecursiveSkillPath) {
    const result = access.resolve(path.key);
    const explicit = exclusions.some(row => row.pathKey === path.key);
    const blocked = result.kind === "system" || result.kind === "invalid" || (result.kind === "exclusion" && result.blockedPathKey !== path.key);
    const descendants = (children.get(path.key) ?? []).filter(row => !matchingPaths || matchingPaths.has(row.key));
    const open = Boolean(matchingPaths) || expanded.has(path.key);
    const node = nodes.get(path.endpointSkillId)!;
    const helpId = `campaign-skill-${path.key.replaceAll(">", "-")}`;
    return <li key={path.key}>
      <div className="campaign-skill-row">
      {descendants.length ? <button className="st-button campaign-skill-expand" type="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(path.key)) next.delete(path.key); else next.add(path.key); return next; })}>{open ? "−" : "+"}</button> : <span className="campaign-skill-leaf" />}
      <label><input type="checkbox" checked={!explicit} disabled={disabled || blocked} aria-describedby={result.reason ? helpId : undefined}
        onChange={event => onChange(event.target.checked ? exclusions.filter(row => row.pathKey !== path.key) : [...exclusions, { skillId: path.endpointSkillId, pathKey: path.key }])} />
        <span>{node.name}</span>{node.tier !== null ? <small>Tier {node.tier}</small> : null}</label>
      </div>
      {result.reason ? <small id={helpId}>{result.reason}</small> : null}
      {open && descendants.length ? <ul>{descendants.map(branch)}</ul> : null}
    </li>;
  }
  return <section className="campaign-skill-selector">
    <h2>Allowed Skills</h2>
    <p>Open a group and expand a branch. Uncheck Skills to block new purchases and grants through that branch.</p>
    <details><summary>How restrictions work</summary><p>Shared paths are controlled separately. New Skills start checked. Starting Tier limits do not prevent you from excluding deeper Skills. Disabled supernatural systems and excluded parents still block their branches.</p><p>Child choices are remembered when you turn a parent off and back on. Existing learned Skills stay recorded; restricted branches cannot receive new investment.</p></details>
    <label className="st-field campaign-skill-search"><span>Find a Skill</span><input className="st-control" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Skills, for example Firearms" /></label>
    {groups.map(group => {
      const roots = group.roots.filter(path => !matchingPaths || matchingPaths.has(path.key));
      return roots.length ? <details className="campaign-skill-group" key={`${group.key}:${Boolean(matchingPaths)}`} open={matchingPaths ? true : undefined}><summary>{group.label} <small>{roots.length} root Skills</small></summary><ul>{roots.map(branch)}</ul></details> : null;
    })}
    {matchingPaths?.size === 0 ? <p>No Skills match this search.</p> : null}
    {!library.paths.length ? <p>No Skill paths are available in the library.</p> : null}
  </section>;
}
