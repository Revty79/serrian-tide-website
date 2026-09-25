import type {PrintTheme} from "@/features/characters/character-print-options";

/** Artwork is decorative only. Titles and all sheet contents remain real text. */
export function PaperSheetMasthead({title, theme = "Universal"}: {title: string; theme?: PrintTheme}) {
  const directory = theme.toLowerCase().replaceAll(" ", "-");
  return <header className="paper-sheet-masthead">
    {theme !== "Plain" ? <svg className="paper-masthead-art" viewBox="0 170 2172 370" preserveAspectRatio="none" aria-hidden="true">
      <image href={`/print/serrian-tide/${directory}/masthead.png`} width="2172" height="724" />
    </svg> : null}
    <div className="paper-sheet-title"><strong>Serrian Tide</strong><span>{title}</span></div>
    <svg className="paper-masthead-rule" viewBox="0 0 560 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 3h214m132 0h214M0 7h195m170 0h195" fill="none" stroke="currentColor" strokeWidth=".5" />
      <path d="m225 3 4-3 4 3-4 3Zm102 0 4-3 4 3-4 3Z" fill="currentColor" />
      <path d="M242 5c7-9 18 7 28-1s19 8 29 0 14-3 19 1" fill="none" stroke="currentColor" strokeWidth=".65" />
    </svg>
  </header>;
}
