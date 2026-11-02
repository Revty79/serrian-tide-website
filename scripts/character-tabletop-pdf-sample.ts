import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCharacterTabletopPdf, buildTabletopPdfPages } from "../src/features/characters/character-tabletop-pdf";
import { TABLETOP_PDF_SHEETS } from "../src/features/characters/character-tabletop-pdf-options";
import { tabletopPdfFixture } from "../src/features/characters/character-tabletop-pdf.fixture";

async function main() {
  const out = path.resolve("artifacts/character-spreadsheet-print/range-correction");
  await mkdir(out, { recursive: true });
  const fonts = { regular: await readFile("public/print/serrian-tide/tabletop/NotoSans-Regular.ttf"), bold: await readFile("public/print/serrian-tide/tabletop/NotoSans-Bold.ttf"), title: await readFile("public/print/serrian-tide/spreadsheet/Lobster-Regular.ttf") };
  for (const crowded of [false, true]) {
    const data = tabletopPdfFixture(crowded), result = await createCharacterTabletopPdf(data, TABLETOP_PDF_SHEETS, fonts);
    const name = crowded ? "crowded" : "sample";
    await writeFile(path.join(out, `${name}.pdf`), result.bytes);
    await writeFile(path.join(out, `${name}-manifest.json`), JSON.stringify({ models: buildTabletopPdfPages(data, TABLETOP_PDF_SHEETS), placements: result.placements, regions: result.regions }, null, 2));
  }
  console.log("Created regular and crowded eight-page PDF samples.");
}
void main();
