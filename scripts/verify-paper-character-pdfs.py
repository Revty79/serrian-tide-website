"""Inspect the actual integrated print artifacts; requires PyMuPDF and Pillow.

Run after SERRIAN_PAPER_SAMPLES=true in the disposable browser harness.
Writes a readable image for every PDF page and a local review gallery.
"""
import html
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf

OUTPUT = Path(__file__).resolve().parents[1] / "docs/samples/paper-character-sheet"


def compact(text):
    # Chromium's Arial subset maps some punctuation (middle dots / dashes) to
    # replacement characters in extraction, although the PDF glyphs render.
    # Compare every letter and number; inspect punctuation in the page images.
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE).casefold()


reports = []
gallery = []
for label in ["adrian-core", "adrian-with-references", "example-a", "example-b"]:
    manifest = json.loads((OUTPUT / f"{label}-checks.json").read_text(encoding="utf-8"))
    document = pymupdf.open(OUTPUT / f"{label}.pdf")
    text = ""
    page_reports = []
    figures = []
    for index, page in enumerate(document):
        assert abs(page.rect.width - 612) < 1 and abs(page.rect.height - 792) < 1, "US Letter required"
        page_text = page.get_text()
        assert compact(manifest["name"]) in compact(page_text) and compact(manifest["campaign"]) in compact(page_text), "Every page needs character identity"
        assert f"Page {index + 1} of {len(document)}" in page_text, "Missing pagination"
        assert "Recorded as of" in page_text, "Missing snapshot time"
        # Exclude repeating margin boxes before matching content across page breaks.
        body_blocks = page.get_text("blocks", clip=pymupdf.Rect(25, 30, 587, 763))
        # Chromium paints positioned mastheads after the body. Restore block
        # reading order so they do not interrupt paragraphs continued across
        # pages. Keep cell/paragraph contents intact, retaining every character.
        body_blocks.sort(key=lambda block: (round(block[1], 1), block[0]))
        body = "".join(block[4] for block in body_blocks)
        assert len(body.strip()) > 80, "Blank or nearly empty page"
        text += body
        spans = [span for block in page.get_text("dict")["blocks"] if "lines" in block
                 for line in block["lines"] for span in line["spans"]]
        for span in spans:
            x0, y0, x1, y1 = span["bbox"]
            assert x0 >= 20 and x1 <= 592 and y0 >= 8 and y1 <= 786, f"Text outside safe page bounds: {span['text']}"
        image = f"{label}-page-{index + 1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(1.65, 1.65), alpha=False).save(OUTPUT / image)
        figures.append(f'<figure><a href="{image}"><img src="{image}" alt="{html.escape(manifest["name"])} page {index + 1}" loading="lazy"></a><figcaption>Page {index + 1} of {len(document)}</figcaption></figure>')
        page_reports.append({"page": index + 1, "characters": len(body), "font_sizes": sorted({round(span["size"], 2) for span in spans}), "punctuation_mapping_warnings": page_text.count('\ufffd')})
    flat = compact(text)
    paragraphs = manifest.get("paragraphs", [check for check in manifest["checks"] if not re.match(r"(?:SK|INV)\d", check)])
    missing = [check for check in paragraphs if compact(check) not in flat]
    assert not missing, f"{label}: omitted or fragmented content: {missing[:3]}"
    for cells in manifest.get("rows", []):
        for cell in cells:
            assert compact(cell) in flat, f"{label}: missing cell {cell}"
    for name, count in Counter(compact(row[0]) for row in manifest.get('rows', [])).items():
        assert flat.count(name) >= count, f"Missing or merged rows: {name}"
    if label in ["example-a", "adrian-core"]:
        assert len(document) == 2, f"Modest sample must fit two pages, got {len(document)}"
        assert "OPTIONAL PLAY REFERENCE" not in text, "Unselected reference pages printed"
    if label.startswith('adrian'):
        assert manifest['rowCount'] == 30, "All 15 skills, 6 spells and 9 inventory entries required"
        assert 'Common Clothes' in document[1].get_text(), "Ninth inventory item moved off page 2"
        assert 'Charged Grasp' in document[1].get_text()
        assert '65' in text, "Currency lost"
    if label == 'example-a':
        assert "Known spells" not in text and "Spellcraft" not in text, "Empty magic sections printed"
    if label == 'example-b':
        assert len(document) > 2, "Developed sample must demonstrate continuation"
        for phrase in ["2/5 charges", "4/5 charges", "End of description 1.", "End of description 2.", "End of description 3.", "End of spell notes 3."]:
            assert compact(phrase) in flat, f"Missing {phrase}"
        for i in range(1, 4):
            assert len(re.findall(rf"\bSP{i:02d}\b", text)) == 1, "Lost or duplicate spell"
    (OUTPUT / f"{label}-text.txt").write_text(text, encoding="utf-8")
    for stale in OUTPUT.glob(f'{label}-page-*.png'):
        if int(stale.stem.rsplit('-', 1)[1]) > len(document):
            assert stale.resolve().parent == OUTPUT.resolve()
            stale.unlink()
    reports.append({"sample": label, "pages": len(document), "paragraphs_checked": len(paragraphs), "table_rows_checked": manifest.get('rowCount', 0), "page_details": page_reports})
    gallery.append(f'<section><h2>{html.escape(manifest["name"])}</h2><p><a href="{label}.pdf">Open PDF ({len(document)} pages)</a></p><div class="pages">{"".join(figures)}</div></section>')

(OUTPUT / "pdf-verification.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")
(OUTPUT / "index.html").write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paper Character Sheet — visual review</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:2rem auto;padding:0 1rem;max-width:1500px;background:#f3f1ed;color:#222}h1{line-height:1.15}a{color:#174f73}.pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:1.5rem}figure{margin:0}img{width:100%;height:auto;border:1px solid #aaa;background:white}figcaption{margin:.3rem 0 1rem}section{margin:2rem 0}
</style><h1>Paper Character Sheet</h1><p>Adrian's core-only sheet comes first, followed by his optional spell and ability references. Both use his saved local record, copied read-only into a disposable review database. The additional demo characters exercise larger inventories and long descriptions. Every PDF was generated through the shared Print option. Click any image for full size. Visual approval is pending.</p>''' + "".join(gallery) + "</html>", encoding="utf-8")
print(json.dumps(reports, indent=2))
