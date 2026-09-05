"use client";

import { useMemo, useState } from "react";

import {
  REVIEW_REQUIRED_ATTRIBUTE_KEY,
  getRecursiveSkillChildren,
  getRecursiveSkillPath,
  searchRecursiveSkillLibrary,
  type RecursiveSkillLibrary,
  type RecursiveSkillNode,
  type RecursiveSkillPath,
} from "@/features/skills/recursive-skill-library";

import type {
  SkillFilterOptions,
  SkillLibraryFilters,
  SkillLibraryItem,
  SkillLibraryResult,
} from "./actions";
import { CORE_SKILL_ATTRIBUTES, skillAttributeOptions } from "./skill-attributes";

export type SkillLibraryView = "list" | "tree";

type SkillLibraryProps = {
  page: SkillLibraryResult;
  filters: SkillLibraryFilters;
  filterOptions: SkillFilterOptions;
  library: RecursiveSkillLibrary;
  selectedSkillId?: number;
  selectedPathKey: string | null;
  selectedAttributeKey: string | null;
  view: SkillLibraryView;
  loading: boolean;
  archiveViewDisabled: boolean;
  onViewChange: (view: SkillLibraryView) => void;
  onArchiveViewChange: (archived: boolean) => void;
  onFiltersChange: (filters: SkillLibraryFilters) => void;
  onSelectList: (skill: SkillLibraryItem) => void;
  onSelectTree: (skill: RecursiveSkillNode, path: RecursiveSkillPath) => void;
  onSelectAttribute: (attributeKey: string) => void;
  onBackToAttributes: () => void;
  onBackToRoots: () => void;
  onNewSkill: () => void;
};

const ATTRIBUTE_LABELS = new Map<string, string>(
  CORE_SKILL_ATTRIBUTES.map(({ value, label }) => [value, label]),
);

function attributeLabel(key: string, fallback: string): string {
  if (key === REVIEW_REQUIRED_ATTRIBUTE_KEY) return "Review / Unlinked";
  return ATTRIBUTE_LABELS.get(key) ?? fallback;
}

function metadata(skill: RecursiveSkillNode): string {
  return [
    skill.classification,
    skill.tier === null ? "Tier N/A" : `Tier ${skill.tier}`,
    skill.primaryAttribute ? `Authored ${skill.primaryAttribute}` : "No authored Attribute",
  ].join(" · ");
}

export function SkillLibrary({
  page,
  filters,
  filterOptions,
  library,
  selectedSkillId,
  selectedPathKey,
  selectedAttributeKey,
  view,
  loading,
  archiveViewDisabled,
  onViewChange,
  onArchiveViewChange,
  onFiltersChange,
  onSelectList,
  onSelectTree,
  onSelectAttribute,
  onBackToAttributes,
  onBackToRoots,
  onNewSkill,
}: SkillLibraryProps) {
  const [treeSearch, setTreeSearch] = useState("");
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
  const selectedAttribute = selectedAttributeKey
    ? library.attributeGroups.find(({ key }) => key === selectedAttributeKey) ?? null
    : null;
  const searchResults = useMemo(
    () => searchRecursiveSkillLibrary(library, treeSearch),
    [library, treeSearch],
  );
  const children = selectedPath ? getRecursiveSkillChildren(library, selectedPath) : [];
  const parentPath = selectedPath && selectedPath.rootToEndpointIds.length > 1
    ? getRecursiveSkillPath(library, selectedPath.rootToEndpointIds.slice(0, -1))
    : null;
  const siblings = parentPath
    ? getRecursiveSkillChildren(library, parentPath).filter(({ key }) => key !== selectedPath?.key)
    : [];
  const primaryAttributeOptions = skillAttributeOptions(filterOptions.primaryAttributes);
  const secondaryAttributeOptions = skillAttributeOptions(filterOptions.secondaryAttributes);

  const changeFilter = (
    update: Partial<SkillLibraryFilters>,
    resetPage = true,
  ) => onFiltersChange({
    ...filters,
    ...update,
    page: resetPage ? 1 : filters.page,
  });

  return (
    <aside className={`skill-library${loading ? " is-loading" : ""}`} aria-label="Skill Library">
      <div className="skill-library__heading">
        <div>
          <p>MASTER CONTENT</p>
          <h2>Skill Library</h2>
        </div>
        <button className="skills-primary-button" type="button" onClick={onNewSkill}>
          New Skill
        </button>
      </div>

      <div className="skill-library__toolbar">
        <div className="skill-library__toolbar-groups">
        <div className="skill-library__view-toggle" aria-label="Skill lifecycle view">
          <button
            type="button"
            className={!filters.archived ? "is-active" : ""}
            aria-pressed={!filters.archived}
            disabled={archiveViewDisabled}
            onClick={() => onArchiveViewChange(false)}
          >
            Active
          </button>
          <button
            type="button"
            className={filters.archived ? "is-active" : ""}
            aria-pressed={Boolean(filters.archived)}
            disabled={archiveViewDisabled}
            onClick={() => onArchiveViewChange(true)}
          >
            Archived
          </button>
        </div>
        <div className="skill-library__view-toggle" aria-label="Library view">
          <button
            type="button"
            className={view === "list" ? "is-active" : ""}
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
          >
            List View
          </button>
          <button
            type="button"
            className={view === "tree" ? "is-active" : ""}
            aria-pressed={view === "tree"}
            disabled={Boolean(filters.archived)}
            onClick={() => onViewChange("tree")}
          >
            Tree View
          </button>
        </div>
        </div>
        <span>{(view === "list" ? page.total : library.skills.length).toLocaleString()} skills</span>
      </div>

      {view === "list" ? (
        <>
          <div className="skill-library__search">
            <label htmlFor="skill-list-search">Search</label>
            <input
              id="skill-list-search"
              type="search"
              value={filters.search ?? ""}
              placeholder="Search by name"
              onChange={(event) => changeFilter({ search: event.target.value })}
            />
          </div>

          <div className="skill-library__filters">
            <label>
              <span>Classification</span>
              <select
                value={filters.classification ?? ""}
                onChange={(event) => changeFilter({ classification: event.target.value || undefined })}
              >
                <option value="">All</option>
                {filterOptions.classifications.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Tier</span>
              <select
                value={filters.tier ?? ""}
                onChange={(event) => changeFilter({ tier: event.target.value ? Number(event.target.value) : undefined })}
              >
                <option value="">All</option>
                {filterOptions.tiers.map((value) => <option key={value} value={value}>Tier {value}</option>)}
              </select>
            </label>
            <label>
              <span>Primary</span>
              <select
                value={filters.primaryAttribute ?? ""}
                onChange={(event) => changeFilter({ primaryAttribute: event.target.value || undefined })}
              >
                <option value="">All</option>
                {primaryAttributeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Secondary</span>
              <select
                value={filters.secondaryAttribute ?? ""}
                onChange={(event) => changeFilter({ secondaryAttribute: event.target.value || undefined })}
              >
                <option value="">All</option>
                {secondaryAttributeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <div data-preserve-scroll="skill-library-list-results" className={`skill-library__results${loading ? " is-loading" : ""}`}>
            {!page.items.length && !loading ? (
              <p className="skill-library__empty">No skills match this library view.</p>
            ) : page.items.map((skill) => (
              <button
                key={skill.id}
                className={`skill-library__row${selectedSkillId === skill.id ? " is-selected" : ""}`}
                type="button"
                aria-pressed={selectedSkillId === skill.id}
                onClick={() => onSelectList(skill)}
              >
                <span className="skill-library__row-name">{skill.name} <code>#{skill.id}</code></span>
                {skill.archivedAt ? <span className="skill-library__row-status">Archived</span> : null}
                <span className="skill-library__row-meta">
                  {skill.classification}{skill.tier ? ` · Tier ${skill.tier}` : " · N/A"}{skill.hasSpellConstruction ? " · Spell Construction" : ""}
                </span>
                {skill.parentNames.length ? (
                  <span className="skill-library__row-parents">{skill.parentNames.length === 1 ? "Parent" : "Parents"}: {skill.parentNames.join(", ")}</span>
                ) : (
                  <span className="skill-library__row-parents is-root">Root Skill</span>
                )}
              </button>
            ))}
          </div>

          <nav className="skill-library__pagination" aria-label="Skill pages">
            <button
              type="button"
              disabled={page.page <= 1 || loading}
              onClick={() => onFiltersChange({ ...filters, page: page.page - 1 })}
            >
              Previous
            </button>
            <span>Page {page.page} of {page.pageCount}</span>
            <button
              type="button"
              disabled={page.page >= page.pageCount || loading}
              onClick={() => onFiltersChange({ ...filters, page: page.page + 1 })}
            >
              Next
            </button>
          </nav>
        </>
      ) : (
        <>
          <div className="skill-library__search">
            <label htmlFor="skill-tree-search">Search every depth</label>
            <input
              id="skill-tree-search"
              type="search"
              value={treeSearch}
              placeholder="Name, exact ID, classification, or Attribute"
              onChange={(event) => setTreeSearch(event.target.value)}
            />
          </div>

          {treeSearch.trim() ? (
            <section data-preserve-scroll="skill-library-search-results" className="skill-library__search-results" aria-label="Skill search results">
              <header>
                <strong>{searchResults.length} exact path {searchResults.length === 1 ? "match" : "matches"}</strong>
                <button type="button" onClick={() => setTreeSearch("")}>Clear Search</button>
              </header>
              {searchResults.length ? searchResults.map((result) => (
                <button
                  className="skill-library__search-result"
                  type="button"
                  key={result.path.key}
                  onClick={() => {
                    onSelectAttribute(result.path.attributeGroupKey);
                    onSelectTree(result.skill, result.path);
                    setTreeSearch("");
                  }}
                >
                  <span><strong>{result.skill.name}</strong> <code>#{result.skill.id}</code></span>
                  <small>{attributeLabel(result.path.attributeGroupKey, result.path.attributeGroupKey)}</small>
                  <span>{result.lineageLabel}</span>
                  {result.path.reviewReasons.length ? <em>{result.path.reviewReasons.length} review warning{result.path.reviewReasons.length === 1 ? "" : "s"}</em> : null}
                </button>
              )) : <p className="skill-library__empty">No exact Skill identity matches this search.</p>}
            </section>
          ) : selectedPath && selectedSkill ? (
            <div className="skill-library__navigator">
              <nav className="skill-library__navigation-actions" aria-label="Skill hierarchy navigation">
                <button type="button" onClick={onBackToAttributes}>Choose Attribute</button>
                <button type="button" onClick={onBackToRoots}>Attribute Roots</button>
                <button
                  type="button"
                  disabled={selectedPath.rootToEndpointIds.length === 1}
                  onClick={() => {
                    const rootPath = getRecursiveSkillPath(library, [selectedPath.rootSkillId]);
                    const root = skillsById.get(selectedPath.rootSkillId);
                    if (rootPath && root) onSelectTree(root, rootPath);
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
                    if (parent) onSelectTree(parent, parentPath);
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
                        onClick={() => path && onSelectTree(node, path)}
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
                </header>
                <dl>
                  <div><dt>Governing root</dt><dd>{skillsById.get(selectedPath.rootSkillId)?.name} <code>#{selectedPath.rootSkillId}</code></dd></div>
                  <div><dt>Effective Attribute</dt><dd>{selectedPath.effectiveAttribute ?? "Review / Unlinked"}</dd></div>
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
                    return <button type="button" key={path.key} onClick={() => onSelectTree(sibling, path)}>{sibling.name} <code>#{sibling.id}</code></button>;
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
                    <button type="button" key={path.key} onClick={() => onSelectTree(child, path)}>
                      <span><strong>{child.name}</strong> <code>#{child.id}</code></span>
                      <small>{metadata(child)}</small>
                      {child.reviewReasons.length ? <em>Review required</em> : null}
                    </button>
                  );
                }) : <p className="skill-library__empty">This exact Skill identity has no immediate children.</p>}
              </section>
            </div>
          ) : selectedAttribute ? (
            <section data-preserve-scroll="skill-library-tree-results" className={`skill-library__attribute-roots${selectedAttribute.key === REVIEW_REQUIRED_ATTRIBUTE_KEY ? " is-review" : ""}`} aria-label={`${attributeLabel(selectedAttribute.key, selectedAttribute.label)} roots`}>
              <header>
                <div>
                  <p>SELECTED ATTRIBUTE</p>
                  <h3>{attributeLabel(selectedAttribute.key, selectedAttribute.label)}</h3>
                </div>
                <button type="button" onClick={onBackToAttributes}>Choose Another</button>
              </header>
              {selectedAttribute.key === REVIEW_REQUIRED_ATTRIBUTE_KEY ? (
                <p className="skill-library__review-note">These roots have broken, missing, cyclic, or unlinked authored placement. They remain visible without guessing.</p>
              ) : null}
              <div>
                {selectedAttribute.rootSkillIds.map((rootId) => {
                  const root = skillsById.get(rootId)!;
                  const rootSummary = rootsById.get(rootId)!;
                  const path = getRecursiveSkillPath(library, [rootId]);
                  return (
                    <button type="button" key={rootId} onClick={() => path && onSelectTree(root, path)}>
                      <span><strong>{root.name}</strong> <code>#{root.id}</code></span>
                      <small>{metadata(root)}</small>
                      <em>{rootSummary.immediateChildCount} immediate {rootSummary.immediateChildCount === 1 ? "child" : "children"}</em>
                      {rootSummary.reviewReasons.length ? <b>Review</b> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="skill-library__attribute-selector">
              <header>
                <p>TREE VIEW</p>
                <h3>Choose an Attribute</h3>
                <span>Roots appear only after you choose their governing Attribute.</span>
              </header>
              <div role="group" aria-label="Skill Attribute selector">
                {library.attributeGroups.map((group) => (
                  <button
                    className={group.key === REVIEW_REQUIRED_ATTRIBUTE_KEY ? "is-review" : ""}
                    type="button"
                    key={group.key}
                    onClick={() => onSelectAttribute(group.key)}
                  >
                    <strong>{attributeLabel(group.key, group.label)}</strong>
                    <span>{group.rootSkillIds.length.toLocaleString()} root {group.rootSkillIds.length === 1 ? "Skill" : "Skills"}</span>
                  </button>
                ))}
              </div>
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
            </div>
          )}
        </>
      )}
    </aside>
  );
}
