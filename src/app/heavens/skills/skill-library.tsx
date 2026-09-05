"use client";

import { useMemo, useState } from "react";

import {
  getRecursiveSkillChildren,
  getRecursiveSkillPath,
  searchRecursiveSkillLibrary,
  type RecursiveSkillLibrary,
  type RecursiveSkillNode,
  type RecursiveSkillPath,
} from "@/features/skills/recursive-skill-library";

type SkillLibraryProps = {
  library: RecursiveSkillLibrary;
  selectedPathKey: string | null;
  loading: boolean;
  onSelect: (skill: RecursiveSkillNode, path: RecursiveSkillPath) => void;
  onNewRoot: () => void;
  onNewChild: (parent: RecursiveSkillNode, path: RecursiveSkillPath) => void;
  onBackToOverview: () => void;
};

function metadata(skill: RecursiveSkillNode): string {
  return [
    skill.classification,
    skill.tier === null ? "Tier N/A" : `Tier ${skill.tier}`,
    skill.primaryAttribute ? `Authored ${skill.primaryAttribute}` : "No authored Attribute",
  ].join(" · ");
}

export function SkillLibrary({
  library,
  selectedPathKey,
  loading,
  onSelect,
  onNewRoot,
  onNewChild,
  onBackToOverview,
}: SkillLibraryProps) {
  const [search, setSearch] = useState("");
  const skillsById = useMemo(
    () => new Map(library.skills.map((skill) => [skill.id, skill])),
    [library.skills],
  );
  const rootsById = useMemo(
    () => new Map(library.roots.map((root) => [root.skillId, root])),
    [library.roots],
  );
  const selectedPath = selectedPathKey
    ? library.paths.find((path) => path.key === selectedPathKey) ?? null
    : null;
  const selectedSkill = selectedPath
    ? skillsById.get(selectedPath.endpointSkillId) ?? null
    : null;
  const searchResults = useMemo(
    () => searchRecursiveSkillLibrary(library, search),
    [library, search],
  );
  const children = selectedPath ? getRecursiveSkillChildren(library, selectedPath) : [];
  const parentPath = selectedPath && selectedPath.rootToEndpointIds.length > 1
    ? getRecursiveSkillPath(library, selectedPath.rootToEndpointIds.slice(0, -1))
    : null;
  const siblings = parentPath
    ? getRecursiveSkillChildren(library, parentPath).filter(({ key }) => key !== selectedPath?.key)
    : [];

  return (
    <aside className={`skill-library${loading ? " is-loading" : ""}`} aria-label="Recursive Skill Library">
      <div className="skill-library__heading">
        <div>
          <p>MASTER CONTENT</p>
          <h2>Skill Library</h2>
        </div>
        <button className="skills-primary-button" type="button" onClick={onNewRoot}>
          New Root Skill
        </button>
      </div>

      <div className="skill-library__search">
        <label htmlFor="skill-search">Search every depth</label>
        <input
          id="skill-search"
          type="search"
          value={search}
          placeholder="Name, exact ID, classification, or Attribute"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {search.trim() ? (
        <section className="skill-library__search-results" aria-label="Skill search results">
          <header>
            <strong>{searchResults.length} exact path {searchResults.length === 1 ? "match" : "matches"}</strong>
            <button type="button" onClick={() => setSearch("")}>Clear Search</button>
          </header>
          {searchResults.length ? searchResults.map((result) => (
            <button
              className="skill-library__search-result"
              type="button"
              key={result.path.key}
              onClick={() => {
                onSelect(result.skill, result.path);
                setSearch("");
              }}
            >
              <span><strong>{result.skill.name}</strong> <code>#{result.skill.id}</code></span>
              <small>{result.path.attributeGroupKey === "REVIEW_REQUIRED" ? "Review Required" : result.path.attributeGroupKey}</small>
              <span>{result.lineageLabel}</span>
              {result.path.reviewReasons.length ? <em>{result.path.reviewReasons.length} review warning{result.path.reviewReasons.length === 1 ? "" : "s"}</em> : null}
            </button>
          )) : <p className="skill-library__empty">No exact Skill identity matches this search.</p>}
        </section>
      ) : selectedPath && selectedSkill ? (
        <div className="skill-library__navigator">
          <nav className="skill-library__navigation-actions" aria-label="Skill hierarchy navigation">
            <button type="button" onClick={onBackToOverview}>Attribute Overview</button>
            <button
              type="button"
              disabled={selectedPath.rootToEndpointIds.length === 1}
              onClick={() => {
                const rootPath = getRecursiveSkillPath(library, [selectedPath.rootSkillId]);
                const root = skillsById.get(selectedPath.rootSkillId);
                if (rootPath && root) onSelect(root, rootPath);
              }}
            >
              Back to Root
            </button>
            <button
              type="button"
              disabled={!parentPath}
              onClick={() => {
                if (!parentPath) return;
                const parent = skillsById.get(parentPath.endpointSkillId);
                if (parent) onSelect(parent, parentPath);
              }}
            >
              Up One Level
            </button>
          </nav>

          <nav className="skill-library__breadcrumbs" aria-label="Selected Skill lineage">
            {selectedPath.rootToEndpointIds.map((skillId, index) => {
              const node = skillsById.get(skillId)!;
              const path = getRecursiveSkillPath(library, selectedPath.rootToEndpointIds.slice(0, index + 1));
              const current = index === selectedPath.rootToEndpointIds.length - 1;
              return (
                <span key={`${selectedPath.key}:${skillId}`}>
                  {index > 0 ? <i aria-hidden="true">/</i> : null}
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    disabled={current}
                    onClick={() => path && onSelect(node, path)}
                  >
                    {node.name} <code>#{node.id}</code>
                  </button>
                </span>
              );
            })}
          </nav>

          <article className="skill-library__selected-detail">
            <header>
              <div>
                <p>SELECTED IDENTITY</p>
                <h3>{selectedSkill.name}</h3>
                <code>Skill #{selectedSkill.id}</code>
              </div>
              <button
                className="skills-secondary-button"
                type="button"
                onClick={() => onNewChild(selectedSkill, selectedPath)}
              >
                Create Child
              </button>
            </header>
            <dl>
              <div><dt>Governing root</dt><dd>{skillsById.get(selectedPath.rootSkillId)?.name} <code>#{selectedPath.rootSkillId}</code></dd></div>
              <div><dt>Effective Attribute</dt><dd>{selectedPath.effectiveAttribute ?? "Review Required"}</dd></div>
              <div><dt>Authored Attribute</dt><dd>{selectedSkill.primaryAttribute ?? "Missing"}{selectedSkill.secondaryAttribute ? ` / ${selectedSkill.secondaryAttribute}` : ""}</dd></div>
              <div><dt>Classification</dt><dd>{selectedSkill.classification}</dd></div>
              <div><dt>Authored tier</dt><dd>{selectedSkill.tier ?? "N/A"}</dd></div>
              <div><dt>Parent identity</dt><dd>{parentPath ? `${skillsById.get(parentPath.endpointSkillId)?.name} (#${parentPath.endpointSkillId})` : "Root Skill"}</dd></div>
            </dl>
            <div className="skill-library__path-preview">
              <strong>Complete path</strong>
              <span>{selectedPath.rootToEndpointIds.map((id) => `${skillsById.get(id)?.name} (#${id})`).join(" → ")}</span>
              <code>{selectedPath.rootToEndpointIds.join(" → ")}</code>
            </div>
            {selectedPath.reviewReasons.length ? (
              <div className="skill-library__warnings" role="status" aria-live="polite">
                <strong>Review warnings</strong>
                <ul>{selectedPath.reviewReasons.map((reason, index) => <li key={`${reason.code}:${reason.skillId}:${index}`}>{reason.message}</li>)}</ul>
              </div>
            ) : null}
          </article>

          {siblings.length ? (
            <section className="skill-library__siblings">
              <h3>Sibling Skills</h3>
              <div>{siblings.map((path) => {
                const sibling = skillsById.get(path.endpointSkillId)!;
                return <button type="button" key={path.key} onClick={() => onSelect(sibling, path)}>{sibling.name} <code>#{sibling.id}</code></button>;
              })}</div>
            </section>
          ) : null}

          <section className="skill-library__children">
            <header>
              <div><p>NEXT LEVEL</p><h3>Immediate Children</h3></div>
              <span>{children.length}</span>
            </header>
            {children.length ? children.map((path) => {
              const child = skillsById.get(path.endpointSkillId)!;
              return (
                <button type="button" key={path.key} onClick={() => onSelect(child, path)}>
                  <span><strong>{child.name}</strong> <code>#{child.id}</code></span>
                  <small>{metadata(child)}</small>
                  {child.reviewReasons.length ? <em>Review required</em> : null}
                </button>
              );
            }) : <p className="skill-library__empty">This exact Skill identity has no immediate children.</p>}
          </section>
        </div>
      ) : (
        <div className="skill-library__attribute-overview">
          <header>
            <p>GOVERNING ATTRIBUTES</p>
            <strong>{library.skills.length.toLocaleString()} Skills · {library.roots.length.toLocaleString()} roots</strong>
          </header>
          {library.reviewReasons.length ? (
            <details className="skill-library__review-ledger">
              <summary>Hierarchy review ledger · {library.reviewReasons.length.toLocaleString()} findings</summary>
              <p>Exact data findings are shown for review; this interface does not repair or infer canonical records.</p>
              <ul>
                {library.reviewReasons.map((reason, index) => (
                  <li key={`${reason.code}:${reason.skillId}:${reason.relationshipIds.join(",")}:${index}`}>
                    <strong>{reason.code.replaceAll("-", " ")}</strong>
                    <span>{reason.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {library.attributeGroups.map((group) => (
            <section className={group.key === "REVIEW_REQUIRED" ? "is-review" : ""} key={group.key}>
              <header><h3>{group.label}</h3><span>{group.rootSkillIds.length}</span></header>
              <div>
                {group.rootSkillIds.map((rootId) => {
                  const root = skillsById.get(rootId)!;
                  const rootSummary = rootsById.get(rootId)!;
                  const path = getRecursiveSkillPath(library, [rootId]);
                  return (
                    <button type="button" key={rootId} onClick={() => path && onSelect(root, path)}>
                      <span><strong>{root.name}</strong> <code>#{root.id}</code></span>
                      <small>{metadata(root)}</small>
                      <em>{rootSummary.immediateChildCount} immediate {rootSummary.immediateChildCount === 1 ? "child" : "children"}</em>
                      {rootSummary.reviewReasons.length ? <b>Review</b> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
