"""Verify actual Chrome PDF text, bounds and sizing, then render all eight original pages.

Requires PyMuPDF and Pillow only for local QA; neither is an application dependency.
"""
import json
from pathlib import Path
import re
import pymupdf
from PIL import Image, ImageDraw

OUT = Path("artifacts/character-spreadsheet-print")
compact = lambda text: "".join(c.lower() for c in text if c.isalnum())
document = pymupdf.open(OUT / "all-sheets.pdf")
manifest = json.loads((OUT / "pdf-manifest.json").read_text(encoding="utf-8"))
texts = [page.get_text() for page in document]
starts = []
assert len(document) == 8, f"Each of the eight selected sheets must occupy exactly one page, got {len(document)}"
for sheet in manifest:
    identifier = compact(f"Aerin Tidewalker {sheet['title']} Saved")
    matches = [index for index, text in enumerate(texts) if identifier in compact(text)]
    assert len(matches) == 1, (sheet["title"], matches)
    starts.append(matches[0])
assert starts == sorted(starts)
for i, sheet in enumerate(manifest):
    end = starts[i] + 1
    text = compact("\n".join(texts[starts[i]:end]))
    for cell in sheet["cells"]:
        if cell["full"]:
            assert compact(cell["full"]) in text, (sheet["title"], cell["address"], cell["full"][:100])
    for note in sheet["notes"]:
        assert compact(note) in text, (sheet["title"], note[:100])
all_text = compact("\n".join(texts))
for i in range(1, 66):
    assert compact(f"Navigation route {i:02}") in all_text
minimum = 99
for i, page in enumerate(document):
    assert abs(page.rect.width - 576) < .1 and abs(page.rect.height - 720) < .1, (i + 1, page.rect)
    assert len(page.get_text().strip()) > 30, f"Blank page {i + 1}"
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if not span["text"].strip():
                    continue
                minimum = min(minimum, span["size"])
                x0, y0, x1, y1 = span["bbox"]
                assert x0 >= -1 and y0 >= -1 and x1 <= 577 and y1 <= 721, (i + 1, span)
assert minimum >= 6.3, minimum
title = next(span for block in document[0].get_text("dict")["blocks"] for line in block.get("lines", []) for span in line["spans"] if span["text"] == "Character Record Sheet")
assert abs(title["size"] - 36 * min(525.6 / 769.272, 644.4 / 945)) < .1, "Chrome must not apply a second page shrink"
assert "Body Shot Bob" in texts[0]
simple = pymupdf.open(OUT / "simple-sheets.pdf")
assert len(simple) == 2, f"A compact front + Skills Back should be two sheets, got {len(simple)}"
assert "Rowan Draft" in simple[0].get_text()
assert "UNSAVED NAME" not in "".join(page.get_text() for page in simple)
contact = Image.new("RGB", (1224, 840), "#dddddd")
draw = ImageDraw.Draw(contact)
for i, index in enumerate(starts):
    pix = document[index].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5))
    pix.save(OUT / f"verified-sheet-{i + 1}.png")
    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    image.thumbnail((306, 396))
    contact.paste(image, (i % 4 * 306, i // 4 * 420))
    draw.text((i % 4 * 306 + 5, i // 4 * 420 + 399), manifest[i]["title"], fill="black")
contact.save(OUT / "verified-contact.png")
report = {"passed": True, "stressPages": len(document), "simplePages": len(simple), "originalSheetPages": [index + 1 for index in starts], "minimumFontPt": minimum, "allCellAndNotesTextPresentOnSamePage": True, "pageInches": [8, 10], "bodyShotBob": True, "noSecondShrink": True}
(OUT / "pdf-receipt.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
