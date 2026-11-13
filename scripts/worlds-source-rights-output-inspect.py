"""Offline inspection of newly owned A3 output; no owner files or network."""
import argparse
import base64
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import pymupdf

parser = argparse.ArgumentParser()
parser.add_argument("receipt", type=Path)
root = parser.parse_args().receipt.resolve()
assert root.parent.name == "artifacts" and root.name.startswith(("collaboration-s7b-a3-browser-", "collaboration-s7b-earth-pass1-expansion-seven-families-"))
outputs = root / "outputs"
renders = root / "pdf-renders"
renders.mkdir(exist_ok=True)
records = []
for file in sorted(outputs.glob("*.pdf")):
    document = pymupdf.open(str(file))
    assert len(document) > 0
    for i, page in enumerate(document):
        text = page.get_text()
        # Stage 8 intentionally embeds the rendered page; it need not expose text objects.
        if text:
            assert "A3 Synthetic Provider" in text, (file.name, i, text)
            assert "example.org/a3-license" in text, (file.name, i)
            assert "Changes:" in text, (file.name, i)
            if file.name in ("crop.pdf", "poster.pdf"):
                assert "Built by" not in text
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(str(renders / f"{file.stem}-{i+1}.png"))
        page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=pymupdf.Rect(0, page.rect.height-125, page.rect.width, page.rect.height)).save(str(renders / f"footer-{file.stem}-{i+1}.png"))
    records.append({"file": file.name, "pages": len(document), "noticeVisualInspectionRequired": True})
assert len(records) == 9, records
assert next(r for r in records if r["file"] == "poster.pdf")["pages"] > 1
svg = ET.fromstring((outputs / "crop.svg").read_bytes())
embedded = svg.find("{http://www.w3.org/2000/svg}image")
assert embedded is not None
raw = base64.b64decode(embedded.attrib["href"].split(",", 1)[1], validate=True)
assert raw.startswith(b"\x89PNG\r\n\x1a\n")
(renders / "svg-embedded.png").write_bytes(raw)
notices = " ".join(svg.itertext())
for required in ("A3 Synthetic Provider", "example.org/a3-license", "Changes:"):
    assert required in notices
images = svg.findall("{http://www.w3.org/2000/svg}image")
assert len(images) == 2, "The verified SVG footer must not depend on a substituted font."
footer_raw = base64.b64decode(images[1].attrib["href"].split(",", 1)[1], validate=True)
footer = pymupdf.Pixmap(footer_raw)
png = pymupdf.Pixmap(str(outputs / "crop.png"))
assert footer.width == png.width and footer.n == png.n
assert footer.samples == png.samples[-len(footer.samples):], "SVG mandatory credits differ from the verified PNG pixels"
mandatory_footer = None
for name in ["world.png", "regional.png", "town.png", "floor.png", "underground.png", "craft.png", "deck.png", "crop.png", "crop.jpeg"]:
    pixmap = pymupdf.Pixmap(str(outputs / name))
    assert pixmap.width > 500 and pixmap.height > 100
    if name.endswith(".png"):
        pixels = pixmap.samples[-72*pixmap.stride:]
        if mandatory_footer is None:
            mandatory_footer = pixels
        else:
            assert pixels == mandatory_footer, (name, "mandatory credit pixels differ")
    # Visual inspection must additionally confirm rasterized notices; metadata alone is not proof.
result = {"passed": True, "pdfs": records, "renderedPages": sum(r["pages"] for r in records), "svgCreditPixelsEqualPng": True, "svgAccessibleNoticesComplete": True, "eightPngMandatoryFootersIdentical": True, "rasterVisualReviewSeparate": True}
(root / "output-inspection.json").write_text(json.dumps(result, indent=2), encoding="utf8")
print(json.dumps(result))
