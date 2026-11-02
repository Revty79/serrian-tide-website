import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRINT_THEMES } from "../src/features/characters/character-print-options";
import { paperSheetMastheadPath } from "../src/features/characters/character-paper-theme";
import { createCharacterTabletopPdf } from "../src/features/characters/character-tabletop-pdf";
import { tabletopPdfFixture, tabletopWeaponPdfFixture } from "../src/features/characters/character-tabletop-pdf.fixture";
import { TABLETOP_PDF_SHEETS } from "../src/features/characters/character-tabletop-pdf-options";

async function main() {
  const out = path.resolve(process.env.SERRIAN_PRINT_QA_OUTPUT ?? "artifacts/character-spreadsheet-print/paper-styles"); await mkdir(out, { recursive: true });
  const fonts = { regular: await readFile("public/print/serrian-tide/tabletop/NotoSans-Regular.ttf"), bold: await readFile("public/print/serrian-tide/tabletop/NotoSans-Bold.ttf"), title: await readFile("public/print/serrian-tide/spreadsheet/Lobster-Regular.ttf"), serif: await readFile("public/print/serrian-tide/tabletop/NotoSerif-Bold.ttf") };
  await writeFile(path.join(out, "original.pdf"), (await createCharacterTabletopPdf(tabletopPdfFixture(), TABLETOP_PDF_SHEETS, fonts)).bytes);
  for (const theme of PRINT_THEMES) {
    const artwork = paperSheetMastheadPath(theme);
    const result = await createCharacterTabletopPdf(tabletopWeaponPdfFixture(), TABLETOP_PDF_SHEETS, fonts, { theme, headings: "genre", masthead: artwork ? await readFile("public" + artwork) : undefined });
    const name = theme.toLowerCase().replaceAll(" ", "-");
    await writeFile(path.join(out, name + ".pdf"), result.bytes);
    await writeFile(path.join(out, name + "-manifest.json"), JSON.stringify({ pages: result.pages, placements: result.placements, regions: result.regions }, null, 2));
  }
  console.log("Created all eight Paper styles with the shared tabletop layout.");
}
void main();
