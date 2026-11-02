"""Verify styled PDFs preserve the table layout, then render all eight appearances."""
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

OUT = Path("artifacts/character-spreadsheet-print/paper-styles")
themes = ["universal", "fantasy", "modern", "apocalyptic", "western", "science-fiction", "horror", "plain"]
compact = lambda value: "".join(c.casefold() for c in value if c.isalnum())
reports = []
contact = Image.new("RGB", (1224, 1584), "#ddd")
for index, theme in enumerate(themes):
    pdf = pymupdf.open(OUT / f"{theme}.pdf")
    manifest = json.loads((OUT / f"{theme}-manifest.json").read_text(encoding="utf-8"))
    assert len(pdf) == 8
    for page_index, page in enumerate(pdf):
        assert page.rect == pymupdf.Rect(0, 0, 612, 792)
        text = compact(page.get_text())
        for entry in manifest["placements"]:
            if entry["page"] == page_index + 1:
                assert compact(entry["text"]) in text, (theme, page_index, entry["text"])
        assert bool(page.get_images()) == (theme != "plain"), (theme, "Artwork selection")
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    assert x0 >= 8 and y0 >= 8 and x1 <= 604 and y1 <= 784, (theme, page_index, span)
        if page_index < 2:
            pix = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5))
            pix.save(OUT / f"{theme}-{page_index+1}.png")
    assert "Body Shot Bob" in pdf[0].get_text()
    assert "Damage" in pdf[0].get_text() and "Spent" in pdf[0].get_text()
    pix = pdf[0].get_pixmap(matrix=pymupdf.Matrix(.5, .5))
    picture = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    contact.paste(picture, (index % 4 * 306, index // 4 * 528))
    ImageDraw.Draw(contact).text((index % 4 * 306 + 5, index // 4 * 528 + 400), theme, fill="black")
    reports.append({"theme": theme, "pages": 8, "pagePoints": [612, 792], "allTextPresent": True, "artwork": theme != "plain"})
old = pymupdf.open("artifacts/character-spreadsheet-print/range-correction/sample.pdf")
original = pymupdf.open(OUT / "original.pdf")
for a, b in zip(old, original):
    assert a.get_pixmap().samples == b.get_pixmap().samples, "The approved original PDF appearance must remain pixel-identical"
browser_reports = []
browser_baseline = OUT / "browser-original-after-style.pdf"
if browser_baseline.exists():
    reference = pymupdf.open(browser_baseline)
    def table_text(page):
        return [(span["text"], tuple(round(value, 2) for value in span["bbox"])) for block in page.get_text("dict")["blocks"] for line in block.get("lines", []) for span in line["spans"] if span["bbox"][1] > 47.2 and span["bbox"][3] < 772]
    for theme in themes:
        pdf = pymupdf.open(OUT / f"browser-paper-{theme}.pdf")
        assert len(pdf) == 2
        for index, page in enumerate(pdf):
            assert page.rect == pymupdf.Rect(0, 0, 612, 792)
            assert table_text(page) == table_text(reference[index]), (theme, "Browser theme changed table data or positions")
            assert bool(page.get_images()) == (theme != "plain")
        text = "".join(page.get_text() for page in pdf)
        assert "Disposable print fixture" not in text and "A passive ability without a governing attribute" not in text
        assert "Navigation route 65" in text
        browser_reports.append({"theme": theme, "pages": 2, "sameTableContentAndPositions": True})
    saved = pymupdf.open(OUT / "browser-paper-saved.pdf")
    assert len(saved) == 2 and "Rowan Draft" in saved[0].get_text()
    assert "UNSAVED NAME" not in "".join(page.get_text() for page in saved)
contact.crop((0, 0, 1224, 1056)).save(OUT / "themes-contact.png")
(OUT / "pdf-receipt.json").write_text(json.dumps({"passed": True, "themes": reports, "browserThemes": browser_reports, "originalPixelIdentical": True}, indent=2) + "\n")
print(json.dumps(reports))
