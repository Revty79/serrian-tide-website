import { isAstronomyFamily } from "./astronomy";
import { sourceLabel } from "./calendar-dates";
import type { LoreDraft, LoreRecord } from "./peoples";
import styles from "./creator-workshop.module.css";

type Props = { draft: LoreDraft; record?: LoreRecord | null; worldId?: string; timelineId?: string; review?: boolean; ordinary?: boolean };
/** Read the authored model and exact retained sources; never calculate from prose. */
export function SkySourceDetails({ draft, record, worldId, timelineId, review = false, ordinary = false }: Props) {
  if (!isAstronomyFamily(draft.family)) return null;
  const cycle = draft.cycle, bindings = draft.calendarBindings ?? [];
  const context = `&timeline=${timelineId ?? ""}${review ? "&review=1" : ""}${ordinary ? "&knowledge=ordinary" : ""}`;
  const calendarHref = (id: string) => `/worlds/${worldId}?tab=calendars${context}&calendarVersion=${id}`;
  const anchor = cycle?.anchorCalendar && JSON.stringify(cycle.anchorCalendar) === JSON.stringify(record?.draft.cycle?.anchorCalendar) ? record?.skySources?.anchor : null;
  return <section aria-label="Authored sky information"><h4>Authored sky information</h4>
    {cycle ? <>
      <dl>
        <div><dt>Time scale and unit</dt><dd>{cycle.scale === "world-year" ? "Canonical World years" : "Shared elapsed days"}; measured in {cycle.unit} units.</dd></div>
        <div><dt>Repeating period</dt><dd>{cycle.period ?? "Unknown; no calculable recurrence"}</dd></div>
        <div><dt>Model precision</dt><dd>{cycle.approximate ? "Approximate model and projections" : "Exact authored inputs"}</dd></div>
        <div><dt>Starting point</dt><dd>{anchor ? <>{sourceLabel(anchor)}; {anchor.start.calendarName} · {anchor.start.versionTitle} · retained rules revision {anchor.start.revision} · elapsed day {anchor.start.elapsedDay}{worldId && <p><a href={calendarHref(anchor.start.versionId)}>Read this original calendar</a></p>}</> : cycle.anchorCalendar ? <>Selected calendar date: year {cycle.anchorCalendar.date.year}, month {cycle.anchorCalendar.date.month}, day {cycle.anchorCalendar.date.day}{cycle.anchorCalendar.date.intercalaryId ? " · named intercalary occurrence" : ""}; rules revision {cycle.anchorCalendar.revision}. Original notation is retained when saved.</> : cycle.anchor !== null ? `${cycle.anchor} (${cycle.scale === "world-year" ? "World-year position" : "shared elapsed-day position"})` : "Unknown; no occurrence dates are inferred"}</dd></div>
        <div><dt>Phase offset</dt><dd>{cycle.offset} {cycle.unit}</dd></div>
        <div><dt>Occurrence window</dt><dd>{cycle.window ? `${cycle.window} ${cycle.unit}` : "No authored window"}</dd></div>
        <div><dt>Applicability positions</dt><dd>Beginning: {cycle.beginning ?? "unknown"}; ending: {cycle.ending ?? "unknown"}. These whole positions use the selected time scale.</dd></div>
      </dl>
      {!!cycle.phases.length && <section><h5>Original phase sequence</h5>{cycle.phases.map((phase, index) => <section key={phase.id}><h5>{index + 1}. {phase.name || "Unnamed phase"}</h5><p>{phase.duration ? `${phase.duration} ${cycle.unit}` : "Qualitative phase; duration unknown"}</p>{phase.description && <p className={styles.prose}>{phase.description}</p>}</section>)}</section>}
      {(!cycle.period || (cycle.anchor === null && !cycle.anchorCalendar)) && <p>No exact recurrence dates can be projected until a period and supported anchor are known.</p>}
      {cycle.phases.some(phase => phase.duration === null) && <p>Qualitative phases retain their order and description. A phase state is not calculated from incomplete durations.</p>}
      <p>Hour and minute calculations require explicit units in the anchored calendar. World years have no inferred day length. Written exceptions and applicability accounts do not override the model.</p>
    </> : draft.family === "skyCycle" ? <p>Narrative sky pattern; no structured model is defined.</p> : <p>An authored sky account; this does not establish a calculated occurrence or create History.</p>}
    {!!bindings.length && <section><h5>Original calendar associations</h5>{bindings.map((binding, index) => {
      const source = record?.skySources?.calendars.find(source => source.id === binding.id && source.calendarVersionId === binding.calendarVersionId && source.revision === binding.revision);
      const name = source ? `${source.calendarName} · ${source.versionTitle}` : binding.calendarVersionId ? "Selected calendar rules" : "Calendar needs a saved selection";
      return <section key={binding.id}><h5>{index + 1}. {worldId && binding.calendarVersionId ? <a href={calendarHref(binding.calendarVersionId)}>{name}</a> : name}</h5><p>Retained rules revision {binding.revision}{binding.protected ? " · private association" : ""}</p><p><strong>Original meaning:</strong> {binding.role || "Not yet described"}</p>{binding.account && <p className={styles.prose}>{binding.account}</p>}</section>;
    })}<p>These associations retain their original rules revision, roles and accounts. They do not change calendar rules or infer who owns or uses a calendar.</p></section>}
    {record && worldId && timelineId && <p><a href={`/worlds/${worldId}?tab=cosmology${context}&sky=1&entity=${record.id}`}>View this account with sky projections</a></p>}
  </section>;
}
export function AstronomySourceDetails({ record, ...context }: Omit<Props, "draft" | "record"> & { record: LoreRecord }) { return <SkySourceDetails draft={record.draft} record={record} {...context}/>; }
