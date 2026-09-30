"""Inspect actual Pass 5 browser PDFs, including every rendered reference paragraph.

No database access. Requires PyMuPDF and Pillow; exports remain ignored artifacts.
"""
import json
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

OUTPUT = Path("artifacts/guidance/special-ability-pass-5")


def compact(text):
    return "".join(character.lower() for character in text if character.isalnum())


reports, thumbs = [], []
for label in ["quick", "reference-universal", "reference-plain"]:
    manifest = json.loads((OUTPUT / f"{label}-checks.json").read_text(encoding="utf-8"))
    document = pymupdf.open(OUTPUT / f"{label}.pdf")
    body_text, page_reports = "", []
    for index, page in enumerate(document):
        assert abs(page.rect.width - 612) < 1 and abs(page.rect.height - 792) < 1
        text = page.get_text()
        assert manifest["name"] in text
        assert f"Page {index + 1} of {len(document)}" in text
        body = page.get_text(clip=pymupdf.Rect(25, 31, 587, 761))
        # The unchanged two-column General back can carry its last compact
        # ability onto a short continuation for this deliberately crowded fixture.
        assert len(body.strip()) > (50 if label == "quick" else 160), f"{label} p{index+1}: empty/sparse reference page"
        body_text += body
        spans = [span for block in page.get_text("dict")["blocks"] if "lines" in block for line in block["lines"] for span in line["spans"]]
        for span in spans:
            x0, y0, x1, y1 = span["bbox"]
            assert x0 >= 20 and x1 <= 592 and y0 >= 8 and y1 <= 786, f"{label}: clipped: {span['text']}"
            if span["text"].strip() and span["text"].strip() != "◆":
                assert span["size"] >= 7.9, f"{label}: tiny text: {span}"
        content_spans = [s for s in spans if s["bbox"][1] >= 31 and s["bbox"][3] <= 761 and s["text"].strip()]
        for position, span in enumerate(content_spans):
            if span["text"].startswith("Synthetic ") and span["flags"] & 16:
                assert position < len(content_spans)-1, f"{label}: orphaned heading {span['text']}"
        filename = OUTPUT / f"{label}-page-{index+1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), alpha=False).save(filename)
        thumb = Image.open(filename).convert("RGB")
        thumb.thumbnail((300, 390))
        tile = Image.new("RGB", (320, 425), "#ddd")
        tile.paste(thumb, ((320-thumb.width)//2, 10))
        ImageDraw.Draw(tile).text((8, 403), f"{label} / {index+1}", fill="black")
        thumbs.append(tile)
        page_reports.append({"page": index+1, "body_characters": len(body), "font_sizes": sorted({round(s["size"], 1) for s in spans})})
    flat = compact(body_text)
    missing = [p for p in manifest["paragraphs"] if compact(p) not in flat]
    assert not missing, f"{label}: missing paragraphs: {missing[:2]}"
    for row in manifest["rows"]:
        for cell in row:
            assert compact(cell) in flat, f"{label}: missing table cell {cell}"
    if label.startswith("reference"):
        for required in ["END-LONG-RESOURCE", "Synthetic resource cost: 2", "Choice required", "Synthetic always capability", "Synthetic manual ruling", "Synthetic override", "Synthetic modifier", "Synthetic interaction", "Synthetic activated", "critical-success", "newer format"]:
            assert compact(required) in flat, f"{label}: missing {required}"
        assert len(document) > 2, "Long definitions must span real pages"
    else:
        assert compact("END-LONG-RESOURCE") not in flat, "Quick Print must not gain long mechanics"
    (OUTPUT / f"{label}-text.txt").write_text(body_text, encoding="utf-8")
    reports.append({"sample": label, "pages": len(document), "paragraphs_checked": len(manifest["paragraphs"]), "rows_checked": len(manifest["rows"]), "page_details": page_reports})

for start in range(0, len(thumbs), 12):
    subset = thumbs[start:start+12]
    contact = Image.new("RGB", (1280, 425*((len(subset)+3)//4)), "white")
    for i, tile in enumerate(subset):
        contact.paste(tile, ((i % 4)*320, (i//4)*425))
    contact.save(OUTPUT / f"review-contact-{start//12+1}.png")
(OUTPUT / "pdf-verification.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")
print(json.dumps(reports, indent=2))
