"""Verify styled PDFs preserve the table layout, then render all eight appearances."""
import json
import os
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

OUT = Path(os.environ.get("SERRIAN_PRINT_QA_OUTPUT", "artifacts/character-spreadsheet-print/paper-styles"))

def weapon_rows(page, expected_names=None, expected_types=None):
    # Header plus five equally sized ruled rows inside the enlarged weapon block.
    row = (792 - 18 - 11) / 60
    top, bottom = 9 + 19 * row, 9 + 29 * row
    height = 9 * row / 5
    cells = sorted([drawing["rect"] for drawing in page.get_drawings()
                    if len(drawing["items"]) == 4 and abs(drawing["rect"].x0 - 9) < .1 and abs(drawing["rect"].width - 162) < .1
                    and drawing["rect"].y0 >= top + row - .1 and drawing["rect"].y1 <= bottom + .1], key=lambda cell: cell.y0)
    assert len(cells) == 5, ("Five weapon rows required", cells)
    assert all(abs(cell.height - height) < .1 for cell in cells)
    names = [compact(page.get_text(clip=cell)) for cell in cells]
    types = [compact(page.get_text(clip=pymupdf.Rect(cell.x1, cell.y0, cell.x1 + 81, cell.y1))) for cell in cells]
    if expected_names:
        assert names == [compact(value) for value in expected_names], names
    if expected_types:
        assert types == [compact(value) for value in expected_types], types
    return names, types
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
    weapon_rows(pdf[0], [".357 Revolver - Copy #1 (Single)", "Bowie Knife", "Longsword", "Spear", "Hand Axe"],
                ["Piercing", "Slashing / Piercing", "Blunt / Slashing / Piercing", "Piercing", "Slashing"])
    pix = pdf[0].get_pixmap(matrix=pymupdf.Matrix(.5, .5))
    picture = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    contact.paste(picture, (index % 4 * 306, index // 4 * 528))
    ImageDraw.Draw(contact).text((index % 4 * 306 + 5, index // 4 * 528 + 400), theme, fill="black")
    reports.append({"theme": theme, "pages": 8, "pagePoints": [612, 792], "allTextPresent": True, "artwork": theme != "plain"})
old = pymupdf.open("artifacts/character-spreadsheet-print/weapon-correction/original.pdf")
original = pymupdf.open(OUT / "original.pdf")
assert old[0].get_pixmap().samples == original[0].get_pixmap().samples, "The accepted five-weapon front must remain pixel-identical"
weapon_rows(original[0])
for theme in themes:
    pdf = pymupdf.open(OUT / f"{theme}.pdf")
    for page in list(pdf)[1:]:
        text = page.get_text()
        assert "Rank" in text and "#" in text and "%" in text
        assert "Beacon Sense" in text and "95%" in text
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
        names, types = weapon_rows(pdf[0])
        assert all(any(name.startswith(compact(value)) for name in names) for value in ["Practice Baton", "Print Revolver", "Print Bowie Knife", "Print Longsword", "Print Spear"]), names
        assert compact("Blunt / Slashing / Piercing") in types and compact("Slashing / Piercing") in types
        assert "aaa" not in "".join(names) and not any("improvised" in value or "revolver" in value for value in types)
        browser_reports.append({"theme": theme, "pages": 2, "sameTableContentAndPositions": True})
    saved = pymupdf.open(OUT / "browser-paper-saved.pdf")
    assert len(saved) == 2 and "Rowan Draft" in saved[0].get_text()
    assert "UNSAVED NAME" not in "".join(page.get_text() for page in saved)
contact.crop((0, 0, 1224, 1056)).save(OUT / "themes-contact.png")
(OUT / "pdf-receipt.json").write_text(json.dumps({"passed": True, "themes": reports, "browserThemes": browser_reports, "fiveWeaponRows": True, "realWeaponsFirst": True, "authoredDamageTypes": True, "skillPointsRankTarget": True, "abilityScoreTarget": True, "originalFrontPixelIdentical": True}, indent=2) + "\n")
print(json.dumps(reports))
