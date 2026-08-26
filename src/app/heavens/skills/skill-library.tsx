"use client";

import { useMemo } from "react";

import type {
  SkillFilterOptions,
  SkillLibraryFilters,
  SkillLibraryItem,
  SkillLibraryResult,
} from "./actions";
import { skillAttributeOptions } from "./skill-attributes";

type LibraryView = "list" | "tree";

type SkillLibraryProps = {
  page: SkillLibraryResult;
  filters: SkillLibraryFilters;
  filterOptions: SkillFilterOptions;
  selectedSkillId?: number;
  view: LibraryView;
  loading: boolean;
  onViewChange: (view: LibraryView) => void;
  onFiltersChange: (filters: SkillLibraryFilters) => void;
  onSelect: (skill: SkillLibraryItem) => void;
  onNewSkill: () => void;
};

type DisplayRow = { skill: SkillLibraryItem; depth: number };

function createTreeRows(page: SkillLibraryResult): DisplayRow[] {
  const byId = new Map(page.items.map((skill) => [skill.id, skill]));
  const children = new Map<number, number[]>();
  const hasVisibleParent = new Set<number>();

  for (const edge of page.relationships) {
    if (
      edge.relationshipType.toLowerCase() !== "parent" ||
      !byId.has(edge.skillId) ||
      !byId.has(edge.relatedSkillId)
    ) {
      continue;
    }

    const current = children.get(edge.relatedSkillId) ?? [];
    current.push(edge.skillId);
    children.set(edge.relatedSkillId, current);
    hasVisibleParent.add(edge.skillId);
  }

  const order = new Map(page.items.map((skill, index) => [skill.id, index]));
  for (const ids of children.values()) {
    ids.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }

  const rows: DisplayRow[] = [];
  const visited = new Set<number>();

  const visit = (skillId: number, depth: number) => {
    if (visited.has(skillId)) return;
    const skill = byId.get(skillId);
    if (!skill) return;
    visited.add(skillId);
    rows.push({ skill, depth });
    for (const childId of children.get(skillId) ?? []) visit(childId, depth + 1);
  };

  for (const skill of page.items) {
    if (!hasVisibleParent.has(skill.id)) visit(skill.id, 0);
  }
  for (const skill of page.items) visit(skill.id, 0);

  return rows;
}

export function SkillLibrary({
  page,
  filters,
  filterOptions,
  selectedSkillId,
  view,
  loading,
  onViewChange,
  onFiltersChange,
  onSelect,
  onNewSkill,
}: SkillLibraryProps) {
  const primaryAttributeOptions = skillAttributeOptions(filterOptions.primaryAttributes);
  const secondaryAttributeOptions = skillAttributeOptions(filterOptions.secondaryAttributes);
  const rows = useMemo(
    () =>
      view === "tree"
        ? createTreeRows(page)
        : page.items.map((skill) => ({ skill, depth: 0 })),
    [page, view],
  );

  const changeFilter = (
    update: Partial<SkillLibraryFilters>,
    resetPage = true,
  ) =>
    onFiltersChange({
      ...filters,
      ...update,
      page: resetPage ? 1 : filters.page,
    });

  return (
    <aside className="skill-library" aria-label="Skill Library">
      <div className="skill-library__heading">
        <div>
          <p>MASTER CONTENT</p>
          <h2>Skill Library</h2>
        </div>
        <button className="skills-primary-button" type="button" onClick={onNewSkill}>
          New Skill
        </button>
      </div>

      <div className="skill-library__search">
        <label htmlFor="skill-search">Search</label>
        <input
          id="skill-search"
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
            onChange={(event) =>
              changeFilter({ classification: event.target.value || undefined })
            }
          >
            <option value="">All</option>
            {filterOptions.classifications.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Tier</span>
          <select
            value={filters.tier ?? ""}
            onChange={(event) =>
              changeFilter({
                tier: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          >
            <option value="">All</option>
            {filterOptions.tiers.map((value) => (
              <option key={value} value={value}>Tier {value}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Primary</span>
          <select
            value={filters.primaryAttribute ?? ""}
            onChange={(event) =>
              changeFilter({ primaryAttribute: event.target.value || undefined })
            }
          >
            <option value="">All</option>
            {primaryAttributeOptions.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Secondary</span>
          <select
            value={filters.secondaryAttribute ?? ""}
            onChange={(event) =>
              changeFilter({ secondaryAttribute: event.target.value || undefined })
            }
          >
            <option value="">All</option>
            {secondaryAttributeOptions.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="skill-library__toolbar">
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
            onClick={() => onViewChange("tree")}
          >
            Tree View
          </button>
        </div>
        <span>{page.total.toLocaleString()} skills</span>
      </div>

      <div className={`skill-library__results${loading ? " is-loading" : ""}`}>
        {rows.length === 0 && !loading ? (
          <p className="skill-library__empty">No skills match this library view.</p>
        ) : (
          rows.map(({ skill, depth }) => (
            <button
              key={skill.id}
              className={`skill-library__row${selectedSkillId === skill.id ? " is-selected" : ""}`}
              type="button"
              aria-pressed={selectedSkillId === skill.id}
              style={{ "--skill-depth": depth } as React.CSSProperties}
              onClick={() => onSelect(skill)}
            >
              <span className="skill-library__row-name">
                {view === "tree" && (depth > 0 || skill.parentNames.length > 0) ? (
                  <span aria-hidden="true">↳</span>
                ) : null}
                {skill.name}
              </span>
              <span className="skill-library__row-meta">
                {skill.classification}
                {skill.tier ? ` · Tier ${skill.tier}` : " · N/A"}
                {skill.hasSpellConstruction ? " · Spell Construction" : ""}
              </span>
              {skill.parentNames.length > 0 ? (
                <span className="skill-library__row-parents">
                  {skill.parentNames.length === 1 ? "Parent" : "Parents"}: {skill.parentNames.join(", ")}
                </span>
              ) : (
                <span className="skill-library__row-parents is-root">Root Skill</span>
              )}
            </button>
          ))
        )}
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
    </aside>
  );
}
