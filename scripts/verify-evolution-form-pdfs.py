"""Inspect actual Pass 5 Chrome exports. Requires PyMuPDF and Pillow; no database access."""
import json
import sys
from pathlib import Path

# Optional workspace-local verification tools, never an application dependency.
sys.path.insert(0, str(Path("artifacts/guidance/pdf-tools").resolve()))
import pymupdf
from PIL import Image, ImageDraw

root = Path("artifacts/guidance/creature-evolutions")
compact = lambda text: "".join(c.lower() for c in text if c.isalnum())
reports, thumbnails = [], []
for label, name, count in [
    ("character-form-packet", "Pass Five Player Character", 3),
    ("race-npc-form-packet", "Pass Five Race NPC", 3),
    ("player-locked-form", "Pass Five Player Character", 1),
]:
    manifest = json.loads((root / f"{label}.json").read_text(encoding="utf8"))
    document = pymupdf.open(root / f"{label}.pdf")
    text, starts = "", []
    for index, page in enumerate(document):
        assert abs(page.rect.width - 612) < 1 and abs(page.rect.height - 792) < 1
        all_text = page.get_text()
        assert name in all_text and "Recorded as of" in all_text
        assert f"Page {index+1} of {len(document)}" in all_text
        body = page.get_text(clip=pymupdf.Rect(25, 31, 587, 761))
        assert len(body.strip()) > 160, f"{label} page {index+1}: nearly empty spill"
        text += body
        if "REFERENCE ONLY" in body:
            starts.append(index+1)
            assert "NOT CURRENT FORM STATE" in body and "Race:" in body
        spans = [span for block in page.get_text("dict")["blocks"] if "lines" in block for line in block["lines"] for span in line["spans"]]
        for span in spans:
            x0, y0, x1, y1 = span["bbox"]
            assert x0 >= 20 and x1 <= 592 and y0 >= 8 and y1 <= 786, f"{label} page {index+1}: clipped {span['text']}"
            if span["text"].strip():
                assert span["size"] >= 7.9, f"{label}: unreadable text"
        image_path = root / f"{label}-page-{index+1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(image_path)
        thumb = Image.open(image_path).convert("RGB")
        thumb.thumbnail((290, 380))
        tile = Image.new("RGB", (310, 410), "#eeeeee")
        tile.paste(thumb, ((310-thumb.width)//2, 6))
        ImageDraw.Draw(tile).text((8, 391), f"{label} / {index+1}", fill="black")
        thumbnails.append(tile)
    assert len(starts) == count and len(set(starts)) == count
    flat = compact(text)
    for paragraph in manifest["checks"]:
        assert compact(paragraph) in flat, f"{label}: missing paragraph {paragraph[:120]}"
    for row in manifest["rows"]:
        for cell in row:
            assert compact(cell) in flat, f"{label}: missing table cell {cell}"
    assert "nodamageredistributionhasoccurred" in flat
    reports.append({"sample": label, "pages": len(document), "form_start_pages": starts, "paragraphs_checked": len(manifest["checks"]), "rows_checked": len(manifest["rows"]), "clipping": False})
for start in range(0, len(thumbnails), 12):
    tiles = thumbnails[start:start+12]
    contact = Image.new("RGB", (1240, 410*((len(tiles)+3)//4)), "white")
    for i, tile in enumerate(tiles):
        contact.paste(tile, ((i%4)*310, (i//4)*410))
    contact.save(root / f"form-print-contact-{start//12+1}.png")
(root / "form-pdf-verification.json").write_text(json.dumps(reports, indent=2), encoding="utf8")
print(json.dumps(reports, indent=2))
