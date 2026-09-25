"""Verify and render actual browser exports (PyMuPDF + Pillow).
Run after the disposable unified print browser suite; no database access.
"""
import html
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

OUTPUT = Path("docs/samples/unified-character-printing")
def compact(text):
    return "".join(character.lower() for character in text if character.isalnum())

reports, galleries, thumbs = [], [], []
for manifest_file in sorted(OUTPUT.glob("*-checks.json")):
    label = manifest_file.stem.removesuffix("-checks")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    document = pymupdf.open(OUTPUT / f"{label}.pdf")
    text, figures, page_reports, section_starts = "", [], [], {}
    section_titles = [section["title"] for section in manifest["sections"]]
    for index, page in enumerate(document):
        assert abs(page.rect.width - 612) < 1 and abs(page.rect.height - 792) < 1
        page_text = page.get_text()
        assert compact(manifest["name"]) in compact(page_text), f"{label}: missing character"
        assert "Recorded as of" in page_text
        assert f"Page {index + 1} of {len(document)}" in page_text
        header_text = page.get_text(clip=pymupdf.Rect(20, 0, 592, 31))
        # The standard front's presentation heading can be genre flavored;
        # its margin identifier remains Standard front.
        header_titles = ["Standard front" if section["key"] == "front" else section["title"] for section in manifest["sections"]]
        matched = [title for title in header_titles if compact(title) in compact(header_text)]
        assert len(matched) == 1, f"{label} p{index + 1}: missing/ambiguous section header: {header_text}"
        continuation = matched[0] in section_starts
        section_starts.setdefault(matched[0], index + 1)
        blocks = page.get_text("blocks", clip=pymupdf.Rect(25, 31, 587, 761))
        blocks.sort(key=lambda block: (round(block[1], 1), block[0]))
        body = "".join(block[4] for block in blocks)
        assert len(body.strip()) > 160, f"{label} p{index+1}: nearly empty spill"
        if continuation:
            assert max(block[3] for block in blocks) - min(block[1] for block in blocks) >= 110, f"{label} p{index+1}: sparse continuation needs rebalancing"
        text += body
        spans = [span for block in page.get_text("dict")["blocks"] if "lines" in block for line in block["lines"] for span in line["spans"]]
        for span in spans:
            x0,y0,x1,y1 = span["bbox"]
            assert x0 >= 20 and x1 <= 592 and y0 >= 8 and y1 <= 786, f"{label}: out of bounds: {span['text']}"
            if span["text"].strip() and not all(c in "◆" for c in span["text"].strip()):
                assert span["size"] >= 7.9, f"{label}: unreadable text: {span}"
        filename = f"{label}-page-{index+1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(1.65,1.65),alpha=False).save(OUTPUT / filename)
        if index == 0 and label in ["theme-fantasy", "theme-horror", "theme-science-fiction", "adrian-core"]:
            page.get_pixmap(matrix=pymupdf.Matrix(1.65,1.65),colorspace=pymupdf.csGRAY,alpha=False).save(OUTPUT / f"{label}-grayscale.png")
        figures.append(f'<figure><a href="{filename}"><img src="{filename}" loading="lazy"></a><figcaption>{index+1} / {len(document)}</figcaption></figure>')
        thumb = Image.open(OUTPUT / filename).convert("RGB")
        thumb.thumbnail((300, 390))
        tile = Image.new("RGB",(320,425),"#ddd")
        tile.paste(thumb,((320-thumb.width)//2,20))
        ImageDraw.Draw(tile).text((8,407),f"{label} / {index+1}",fill="black")
        thumbs.append(tile)
        page_reports.append({"page": index+1,"section": matched[0],"body_characters":len(body),"font_sizes": sorted({round(s["size"],1) for s in spans})})
    flat = compact(text)
    missing = [paragraph for paragraph in manifest["paragraphs"] if compact(paragraph) not in flat]
    assert not missing, f"{label}: missing or fragmented paragraphs: {missing[:2]}"
    for cells in manifest["rows"]:
        for cell in cells:
            assert compact(cell) in flat, f"{label}: missing table cell {cell}"
    for name,count in Counter(compact(row[0]) for row in manifest["rows"] if row[0]).items():
        assert flat.count(name) >= count, f"{label}: missing repeated row {name}"
    assert len(section_starts) == len(manifest["sections"]), f"{label}: missing independently selected section"
    assert len(set(section_starts.values())) == len(section_starts), f"{label}: selections did not start on their own pages"
    if label.startswith("theme-") or label == "example-a":
        assert len(document) == 2, f"{label}: general core must fit two readable pages"
    (OUTPUT / f"{label}-text.txt").write_text(text,encoding="utf-8")
    for stale in OUTPUT.glob(f"{label}-page-*.png"):
        if int(stale.stem.rsplit("-",1)[1]) > len(document):
            assert stale.resolve().parent == OUTPUT.resolve()
            stale.unlink()
    reports.append({"sample":label,"pages":len(document),"paragraphs_checked":len(manifest["paragraphs"]),"rows_checked":len(manifest["rows"]),"sections":section_starts,"page_details":page_reports})
    galleries.append(f'<section><h2>{html.escape(label)}</h2><a href="{label}.pdf">Open PDF</a><div class="pages">{"".join(figures)}</div></section>')

for start in range(0,len(thumbs),12):
    subset = thumbs[start:start+12]
    contact = Image.new("RGB",(1280,425*((len(subset)+3)//4)),"white")
    for i,tile in enumerate(subset): contact.paste(tile,((i%4)*320,(i//4)*425))
    contact.save(OUTPUT / f"review-contact-{start//12+1}.png")
for stale in OUTPUT.glob("review-contact-*.png"):
    if int(stale.stem.rsplit("-",1)[1]) > (len(thumbs)+11)//12:
        assert stale.resolve().parent == OUTPUT.resolve()
        stale.unlink()
(OUTPUT/"pdf-verification.json").write_text(json.dumps(reports,indent=2),encoding="utf-8")
(OUTPUT/"index.html").write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unified character printing review</title><style>body{font:16px system-ui;max-width:1500px;margin:2rem auto;padding:1rem;background:#eee;color:#111}.pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:1rem}figure{margin:0}img{width:100%}section{margin-bottom:3rem}</style><h1>Unified character printing</h1><p>Populated exports from the integrated saved-character print menu. DEMO entries exist only in a disposable test database. Select any image for full resolution.</p>'+"".join(galleries)+"</html>",encoding="utf-8")
print(json.dumps([{"sample":r["sample"],"pages":r["pages"]} for r in reports],indent=2))
