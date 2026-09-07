import type { ReactNode } from "react";

import styles from "./battle-layout.module.css";

export type BattleMetric = Readonly<{
  label: string;
  value: ReactNode;
  detail?: string;
}>;

export type BattleRosterEntry = Readonly<{
  id: number;
  eyebrow: string;
  name: string;
  detail: string;
  initiative: string;
  status: string;
  attention?: string | null;
  controllable?: boolean;
}>;

export type BattleCommandEntry<TCommand extends string> = Readonly<{
  key: TCommand;
  label: string;
  badge?: number;
  disabled?: boolean;
  disabledReason?: string;
}>;

export type BattleActivityEntry = Readonly<{
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  status: string;
  attention?: string | null;
}>;

export function BattleShell({
  labelledBy,
  children,
}: {
  labelledBy: string;
  children: ReactNode;
}) {
  return <section className={styles.shell} aria-labelledby={labelledBy}>{children}</section>;
}

export function BattleHeader({
  eyebrow,
  title,
  summary,
  metrics,
  actions,
  titleId,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  metrics: readonly BattleMetric[];
  actions: ReactNode;
  titleId: string;
}) {
  return <header className={styles.header}>
    <div className={styles.headerCopy}>
      <span>{eyebrow}</span>
      <h1 id={titleId}>{title}</h1>
      <p>{summary}</p>
    </div>
    <dl className={styles.metrics}>{metrics.map((metric) => <div key={metric.label}>
      <dt>{metric.label}</dt>
      <dd>{metric.value}</dd>
      {metric.detail ? <small>{metric.detail}</small> : null}
    </div>)}</dl>
    <div className={styles.headerActions}>{actions}</div>
  </header>;
}

export function BattleGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function BattleRoster({
  entries,
  selectedId,
  onSelect,
}: {
  entries: readonly BattleRosterEntry[];
  selectedId: number;
  onSelect?: (id: number) => void;
}) {
  return <aside className={styles.roster} aria-label="Encounter participant roster">
    <header><div><span>PARTICIPANTS</span><strong>Battle roster</strong></div><b>{entries.length}</b></header>
    <div className={styles.rosterList}>{entries.map((entry) => {
      const content = <>
        <span className={styles.rosterTopline}><small>{entry.eyebrow}</small><em>{entry.status}</em></span>
        <strong>{entry.name}</strong>
        <span className={styles.rosterDetail}>{entry.detail}</span>
        <span className={styles.rosterFooter}><b>Initiative {entry.initiative}</b>{entry.controllable === false ? <small>Player controlled</small> : null}</span>
        {entry.attention ? <span className={styles.rosterAttention}>{entry.attention}</span> : null}
      </>;
      return onSelect
        ? <button
          type="button"
          key={entry.id}
          className={entry.id === selectedId ? styles.selectedRosterEntry : undefined}
          aria-pressed={entry.id === selectedId}
          onClick={() => onSelect(entry.id)}
        >{content}</button>
        : <article key={entry.id} className={entry.id === selectedId ? styles.selectedRosterEntry : undefined}>{content}</article>;
    })}</div>
    {!entries.length ? <p className={styles.empty}>No participants are available.</p> : null}
  </aside>;
}

export function BattleActor({
  eyebrow,
  name,
  detail,
  metrics,
  status,
  children,
}: {
  eyebrow: string;
  name: string;
  detail: string;
  metrics: readonly BattleMetric[];
  status: string;
  children?: ReactNode;
}) {
  return <section className={styles.actor} aria-label={`Selected combatant: ${name}`}>
    <header>
      <div><span>{eyebrow}</span><h2>{name}</h2><p>{detail}</p></div>
      <em>{status}</em>
    </header>
    <dl className={styles.actorMetrics}>{metrics.map((metric) => <div key={metric.label}>
      <dt>{metric.label}</dt><dd>{metric.value}</dd>{metric.detail ? <small>{metric.detail}</small> : null}
    </div>)}</dl>
    {children ? <div className={styles.actorDetails}>{children}</div> : null}
  </section>;
}

export function BattleCommands<TCommand extends string>({
  commands,
  selected,
  onSelect,
}: {
  commands: readonly BattleCommandEntry<TCommand>[];
  selected: TCommand;
  onSelect: (command: TCommand) => void;
}) {
  return <nav className={styles.commands} aria-label="Battle commands">{commands.map((command) => <button
    type="button"
    key={command.key}
    className={command.key === selected ? styles.selectedCommand : undefined}
    aria-pressed={command.key === selected}
    disabled={command.disabled}
    title={command.disabled ? command.disabledReason : undefined}
    onClick={() => onSelect(command.key)}
  ><span>{command.label}</span>{command.badge ? <b>{command.badge}</b> : null}</button>)}</nav>;
}

export function BattleStage({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return <section className={styles.stage}>
    <header><div><span>{eyebrow}</span><h2>{title}</h2></div><p>{detail}</p></header>
    <div className={styles.stageBody}>{children}</div>
  </section>;
}

export function BattleActivity({
  entries,
  title = "Activity",
  selectedId,
  onSelect,
}: {
  entries: readonly BattleActivityEntry[];
  title?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return <aside className={styles.activity} aria-label={title}>
    <header><div><span>EXCHANGES</span><strong>{title}</strong></div><b>{entries.length}</b></header>
    <div className={styles.activityList}>{entries.map((entry) => {
      const content = <>
        <span className={styles.activityTopline}><small>{entry.eyebrow}</small><em>{entry.status}</em></span>
        <strong>{entry.title}</strong>
        <p>{entry.detail}</p>
        {entry.attention ? <small className={styles.activityAttention}>{entry.attention}</small> : null}
      </>;
      return onSelect
        ? <button type="button" key={entry.id} className={entry.id === selectedId ? styles.selectedActivityEntry : undefined} aria-pressed={entry.id === selectedId} onClick={() => onSelect(entry.id)}>{content}</button>
        : <article key={entry.id}>{content}</article>;
    })}</div>
    {!entries.length ? <p className={styles.empty}>No combat activity has been recorded yet.</p> : null}
  </aside>;
}

export function BattleMainColumn({ children }: { children: ReactNode }) {
  return <div className={styles.mainColumn}>{children}</div>;
}

export function BattleSecondary({ summary, children, open = false }: { summary: string; children: ReactNode; open?: boolean }) {
  return <details className={styles.secondary} open={open}>
    <summary>{summary}</summary>
    <div>{children}</div>
  </details>;
}
