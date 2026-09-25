/** Original vector ornament: decoration only, with real, selectable heading text. */
export function PaperSheetMasthead({ title, folio }: { title: string; folio?: string }) {
  return <header className="paper-sheet-masthead">
    <svg className="paper-landscape" viewBox="0 0 560 58" preserveAspectRatio="none" aria-hidden="true">
      <g className="paper-mountains-far">
        <path d="M0 43 20 23 28 28 48 5 75 31 88 21 114 43 138 50 0 50Z" />
        <path d="m418 50 24-16 14 4 24-29 19 24 11-13 34 26 16-13v17Z" />
      </g>
      <g className="paper-mountains-near">
        <path d="m0 48 21-15 7 6L48 5l-5 26 13-8 20 27 13-13 28 14H0Z" />
        <path d="m441 51 25-18 14-24-3 24 11-8 17 22 18-14 37 15v5Z" />
      </g>
      <g className="paper-snow" fill="none" strokeWidth=".7">
        <path d="m27 30 21-25 16 16-10-4-6-7-4 10-5-2-8 13m13 0-6 13m439-21 3-14 12 15-7-3-5-7m-34 28 13-10" />
      </g>
      <g className="paper-engraving" strokeWidth=".55" fill="none">
        <path d="m4 44 12-8m-8 12 12-7m35-10 8 13m-5-9 10 13m24-6 7 6m358-9 10-9m-5 13 9-10m14-2 8 12m-2-9 10 12" />
        <path d="M0 53c25-4 50 2 74-1s44-1 61 1m-110 3c39-2 55 1 80-1m308-2c33-3 66 1 97-1s39-1 50 0m-114 3c23-1 38 1 71 0" />
      </g>
      <g className="paper-foreground">
        <path d="m0 51 0-7 5-13 5 13H7v6l6-1v-9h-4l7-20 7 20h-4v9l9-1v-9h-4l6-17 6 17h-4v10l13 1v-7h-4l6-16 6 16h-4v8l19 1 22 2H0Z" />
        <path d="m481 51 9-2v-8l-2-1 5-10 5 10-2 1v7l8-2V26h-2l5-13 5 13h-2v8h8V17h-2l6-15 6 15h-2v29l8 1V32h-2l5-12 5 12h-2v16l9 1 11-2v7h-79Z" />
      </g>
      <g className="paper-windows" strokeWidth="1.3">
        <path d="M507 29v4m15-13v5m0 5v5m-8 5v4m23-8v4" />
      </g>
      <path className="paper-banner-rule" d="M0 1h151m258 0h151M0 57h560" fill="none" />
      <path className="paper-banner-diamond" d="m144 1 3-2 3 2-3 2Zm266 0 3-2 3 2-3 2Z" />
    </svg>
    <div className="paper-sheet-title"><strong>Serrian Tide</strong><span>{title}</span></div>
    {folio ? <span className="paper-folio">{folio}</span> : null}
  </header>;
}
