export const TABLETOP_PDF_SHEETS = ["Character Front", "Skills Back", "Spellcraft Back", "Talisman Back", "Faith Back", "Psyonics Back", "Bardic Resonance Back", "Special Abilities Back"] as const;
export type TabletopPdfSheet = typeof TABLETOP_PDF_SHEETS[number];
export const DEFAULT_TABLETOP_PDF_SHEETS: TabletopPdfSheet[] = ["Character Front", "Skills Back"];
export const TABLETOP_PDF_PAPER = { width: 612, height: 792, margin: 9 } as const;

export function tabletopPdfFilename(name: string) {
  return (name.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().slice(0, 100) || "Character") + " - Tabletop Sheets.pdf";
}
