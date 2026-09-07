import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

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

type PlayerRollCombatSnapshot = Readonly<{
  declarations?: Readonly<{
    declarations?: readonly Readonly<{
      actorCharacterId: number;
      status: string;
      rollState: Readonly<{ attackRollId: number | null }>;
      draft: Readonly<{ actionKind: string }>;
      lockedSnapshot?: Readonly<{ authoredSource?: Readonly<{ resolutionMode?: string | null }> | null }> | null;
    }>[];
  }>;
  defenses?: Readonly<{
    reactions?: readonly Readonly<{
      responderCharacterId: number;
      status: string;
      rollRequired: boolean;
      rollId: number | null;
    }>[];
  }>;
}>;

type RollPanelChildProps = Readonly<{
  characterId?: number;
  combat?: PlayerRollCombatSnapshot;
}>;

type SecondaryProps = Readonly<{
  summary: string;
  children: ReactNode;
  open?: boolean;
}>;

const PRIMARY_BATTLE_COMMAND_KEYS = new Set(["attack", "cast", "defend"]);
const HIDDEN_RUNNER_SECONDARY_SUMMARIES = [
  "Initiative controls and shared timeline",
  "All consequence plans",
  "All firearm attack history",
  "Advanced declaration, eligibility, and defense controls",
  "Full combat reference and manual operations",
] as const;
const PLAYER_ROLL_PANEL_SUMMARY = "All readable declarations, Rolls, and consequences";

function playerRollReady(panel: ReactElement<SecondaryProps>): boolean {
  const panelChildren = Children.toArray(panel.props.children);
  for (const child of panelChildren) {
    if (!isValidElement<RollPanelChildProps>(child)) continue;
    const characterId = child.props.characterId;
    const combat = child.props.combat;
    if (typeof characterId !== "number" || !combat) continue;
    const attackReady = combat.declarations?.declarations?.some((declaration) => (
      declaration.actorCharacterId === characterId
      && declaration.status === "rolling-ready"
      && declaration.rollState.attackRollId === null
      && declaration.lockedSnapshot?.authoredSource?.resolutionMode !== "automatic-no-roll"
      && !declaration.draft.actionKind.startsWith("firearm-")
    )) ?? false;
    const defenseReady = combat.defenses?.reactions?.some((reaction) => (
      reaction.responderCharacterId === characterId
      && reaction.status === "declared"
      && reaction.rollRequired
      && reaction.rollId === null
    )) ?? false;
    if (attackReady || defenseReady) return true;
  }
  return false;
}

export function BattleGuide({
  eyebrow,
  title,
  detail,
  tone = "waiting",
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  tone?: "ready" | "waiting" | "attention";
  children?: ReactNode;
}) {
  return <section className={`${styles.guide} ${styles[`guide_${tone}`]}`} aria-live="polite">
    <div><span>{eyebrow}</span><strong>{title}</strong><p>{detail}</p></div>
    {children ? <div className={styles.guideActions}>{children}</div> : null}
  </section>;
}

export function BattleShell({
  labelledBy,
  children,
}: {
  labelledBy: string;
  children: ReactNode;
}) {
  const childList = Children.toArray(children);
  const rollPanelIndex = childList.findIndex((child) => (
    isValidElement<SecondaryProps>(child)
    && child.type === BattleSecondary
    && child.props.summary.startsWith(PLAYER_ROLL_PANEL_SUMMARY)
  ));
  if (rollPanelIndex < 0) return <section className={styles.shell} aria-labelledby={labelledBy}>{children}</section>;

  const rollPanel = childList[rollPanelIndex] as ReactElement<SecondaryProps>;
  if (!playerRollReady(rollPanel)) return <section className={styles.shell} aria-labelledby={labelledBy}>{children}</section>;

  const promotedRollPanel = cloneElement(rollPanel, {
    summary: "ROLL NOW — action or defense",
    open: true,
  });
  const withoutRollPanel = childList.filter((_, index) => index !== rollPanelIndex);
  const headerIndex = withoutRollPanel.findIndex((child) => isValidElement(child) && child.type === BattleHeader);
  const insertionIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const ordered = [
    ...withoutRollPanel.slice(0, insertionIndex),
    promotedRollPanel,
    ...withoutRollPanel.slice(insertionIndex),
  ];
  return <section className={styles.shell} aria-labelledby={labelledBy}>{ordered}</section>;
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
          className={`st-button${entry.id === selectedId ? ` ${styles.selectedRosterEntry}` : ""}`}
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
  const primary = commands.filter((command) => PRIMARY_BATTLE_COMMAND_KEYS.has(command.key));
  const more = commands.filter((command) => !PRIMARY_BATTLE_COMMAND_KEYS.has(command.key));
  const selectedIsMore = more.some((command) => command.key === selected);
  const button = (command: BattleCommandEntry<TCommand>) => <button
    type="button"
    key={command.key}
    className={`st-button${command.key === selected ? ` ${styles.selectedCommand}` : ""}`}
    aria-pressed={command.key === selected}
    disabled={command.disabled}
    title={command.disabled ? command.disabledReason : undefined}
    onClick={() => onSelect(command.key)}
  ><span>{command.label}</span>{command.badge ? <b>{command.badge}</b> : null}</button>;

  return <nav className={styles.commands} aria-label="Battle commands">
    <div className={styles.primaryCommands}>{primary.map(button)}</div>
    {more.length ? <details className={styles.moreCommands} open={selectedIsMore}>
      <summary>More actions</summary>
      <div>{more.map(button)}</div>
    </details> : null}
  </nav>;
}

export function BattleStage({
  eyebrow,
  title,
  detail,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
  id?: string;
}) {
  return <section className={styles.stage} id={id} tabIndex={id ? -1 : undefined}>
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
        ? <button type="button" key={entry.id} className={`st-button${entry.id === selectedId ? ` ${styles.selectedActivityEntry}` : ""}`} aria-pressed={entry.id === selectedId} onClick={() => onSelect(entry.id)}>{content}</button>
        : <article key={entry.id}>{content}</article>;
    })}</div>
    {!entries.length ? <p className={styles.empty}>No combat activity has been recorded yet.</p> : null}
  </aside>;
}

export function BattleMainColumn({ children }: { children: ReactNode }) {
  return <div className={styles.mainColumn}>{children}</div>;
}

export function BattleSecondary({ summary, children, open = false }: SecondaryProps) {
  if (HIDDEN_RUNNER_SECONDARY_SUMMARIES.some((hidden) => summary.startsWith(hidden))) return null;
  const isRollPanel = summary.startsWith(PLAYER_ROLL_PANEL_SUMMARY);
  const displaySummary = isRollPanel
    ? "Rolls & results"
    : summary.startsWith("Completed combat history")
      ? summary.replace("Completed combat history", "Combat history")
      : summary;
  return <details className={styles.secondary} open={open}>
    <summary>{displaySummary}</summary>
    <div>{children}</div>
  </details>;
}
