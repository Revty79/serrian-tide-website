import type { PrintTheme } from "./character-print-options";

/** The established Paper Character Sheet palette and masthead assets. */
export const PAPER_SHEET_STYLES: Record<PrintTheme, { ink: string; rule: string; faint: string; border: "double" | "single" | "dashed" | "technical" }> = {
  Universal: { ink: "#23495d", rule: "#8096a0", faint: "#eaf0f3", border: "double" },
  Fantasy: { ink: "#23495d", rule: "#8096a0", faint: "#eaf0f3", border: "double" },
  Modern: { ink: "#293e50", rule: "#899298", faint: "#edf0f1", border: "single" },
  Apocalyptic: { ink: "#383d3e", rule: "#868c8b", faint: "#f0f0eb", border: "dashed" },
  Western: { ink: "#344a57", rule: "#9a907e", faint: "#f3f0e8", border: "double" },
  "Science Fiction": { ink: "#184b6a", rule: "#7495a7", faint: "#ecf3f7", border: "technical" },
  Horror: { ink: "#303b48", rule: "#8b8991", faint: "#f0eff2", border: "double" },
  Plain: { ink: "#222222", rule: "#888888", faint: "#ffffff", border: "single" },
};

export function paperSheetMastheadPath(theme: PrintTheme) {
  return theme === "Plain" ? null : `/print/serrian-tide/${theme.toLowerCase().replaceAll(" ", "-")}/masthead.png`;
}
