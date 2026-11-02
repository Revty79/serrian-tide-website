"""Inspect real PDF geometry/text/fonts and render final pages for visual review."""
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

OUT = Path("artifacts/character-spreadsheet-print/direct-pdf")
reports = []
compact = lambda value: "".join(c.casefold() for c in value if c.isalnum())
for name in ["sample", "crowded", "browser-all", "browser-simple"]:
    source = OUT / f"{name}.pdf"
    if not source.exists():
        continue
    pdf = pymupdf.open(source)
    count = 2 if name == "browser-simple" else 8
    assert len(pdf) == count, (name, len(pdf))
    text = [page.get_text() for page in pdf]
    manifest = OUT / f"{name}-manifest.json"
    if manifest.exists():
        models = json.loads(manifest.read_text(encoding="utf-8"))["models"]
        for index, model in enumerate(models):
            values = [field["value"] for row in model["fields"] for field in row]
            values += [cell for table in model["tables"] for row in table["rows"] for cell in row]
            values += model["status"] + model["quick"]
            for value in values:
                assert compact(value) in compact(text[index]), (name, index + 1, value)
    assert "Body Shot Bob" in text[0], name
    assert "Most Common Used Skills" in text[0], name
    if name != "browser-simple":
        assert "Derived Abilities" in text[0], name
    else:
        assert "Rowan Draft" in text[0]
        assert "UNSAVED NAME" not in "".join(text)
    assert "ammunitionstatenotinitialized" not in compact("".join(text)), name
    if name != "browser-simple":
        for i in range(1, 66 if name in ["crowded", "browser-all"] else 6):
            expected = f"Navigation route {i:02}" if name == "browser-all" else f"Route {i:02}"
            assert compact(expected) in compact(text[1]), (name, expected)
    for index, page in enumerate(pdf):
        assert page.rect == pymupdf.Rect(0, 0, 612, 1008), (name, index, page.rect)
        assert page.cropbox == page.mediabox
        minimum = 99
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    if not span["text"].strip():
                        continue
                    box = pymupdf.Rect(span["bbox"])
                    assert box.x0 >= 23 and box.y0 >= 22 and box.x1 <= 589 and box.y1 <= 996, (name, index, span)
                    minimum = min(minimum, span["size"])
        assert minimum >= 7.4, (name, index, minimum)
        assert all(font[1] != "n/a" for font in page.get_fonts()), (name, "Fonts must be embedded")
        rules = [drawing for drawing in page.get_drawings() if drawing["color"] == (0, 0, 0) and drawing["width"] >= .5]
        assert len(rules) >= 30, (name, index, len(rules))
        frame = next(drawing["rect"] for drawing in page.get_drawings() if drawing["rect"].width > 560 and drawing["rect"].height > 940)
        assert frame == pymupdf.Rect(24, 24, 588, 968), frame
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(OUT / f"{name}-{index+1}.png")
    reports.append({"name": name, "pages": len(pdf), "pagePoints": [612, 1008], "allTextInBounds": True, "embeddedFonts": True, "completeFrontIncludingQuickRolls": True})
    contact = Image.new("RGB", (1224, 1056), "#ddd")
    for index, page in enumerate(pdf):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(.5, .5))
        picture = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        contact.paste(picture, (index % 4 * 306, index // 4 * 528))
        ImageDraw.Draw(contact).text((index % 4 * 306 + 4, index // 4 * 528 + 507), f"{name}: page {index+1}", fill="black")
    contact.save(OUT / f"{name}-contact.png")
(OUT / "pdf-receipt.json").write_text(json.dumps({"passed": True, "documents": reports}, indent=2) + "\n")
print(json.dumps(reports))
