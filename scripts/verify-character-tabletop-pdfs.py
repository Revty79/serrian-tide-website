"""Inspect real PDF geometry/text/fonts and render final pages for visual review."""
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

OUT = Path("artifacts/character-spreadsheet-print/range-correction")
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
        evidence = json.loads(manifest.read_text(encoding="utf-8"))
        models = evidence["models"]
        for index, model in enumerate(models):
            values = [field["value"] for row in model["fields"] for field in row]
            values += [cell for table in model["tables"] for row in table["rows"] for cell in row]
            values += model["status"] + model["quick"]
            values += [model["marks"]] + [field["value"] for field in model["resources"]]
            if model.get("initiative"):
                values += list(model["initiative"].values())
            for value in values:
                assert compact(value) in compact(text[index]), (name, index + 1, value)
        regions = {region["title"]: region for region in evidence["regions"] if region["page"] == 1}
        summary = [regions[title] for title in ["Attributes", "Hit Points", "Mana", "Initiative", "Resources"]]
        assert all(abs(region["top"] - summary[0]["top"]) < .01 for region in summary)
        assert summary[3]["x"] >= summary[2]["x"] + summary[2]["width"] - .01
        assert summary[4]["x"] >= summary[3]["x"] + summary[3]["width"] - .01
        hp, mana = regions["Hit Points"], regions["Mana"]
        row = hp["height"] / 8
        blank_fields = [pymupdf.Rect(hp["x"] + hp["width"] * .71, hp["top"] + row, hp["x"] + hp["width"], hp["top"] + hp["height"])]
        blank_fields += [pymupdf.Rect(mana["x"] + mana["width"] / 2, mana["top"] + index * row, mana["x"] + mana["width"], mana["top"] + (index + 1) * row) for index in [3, 5, 7]]
        for word in pdf[0].get_text("words"):
            center = pymupdf.Point((word[0] + word[2]) / 2, (word[1] + word[3]) / 2)
            assert not any(center in rectangle for rectangle in blank_fields), (name, "Handwritten tracking field was filled", word)
    assert "Body Shot Bob" in text[0], name
    assert "Most Common Used Skills" in text[0], name
    if name != "browser-simple":
        assert "Derived Abilities" in text[0], name
    else:
        assert "Rowan Draft" in text[0]
        assert "UNSAVED NAME" not in "".join(text)
    assert "ammunitionstatenotinitialized" not in compact("".join(text)), name
    if name != "browser-simple":
        assert "S/M/L 25/50/100 feet" in text[0], (name, "Structured weapon bands are missing")
    front_regions = {region["title"]: region for region in json.loads((OUT / "sample-manifest.json").read_text(encoding="utf-8"))["regions"] if region["page"] == 1}
    resources = front_regions["Resources"]
    for word in pdf[0].get_text("words"):
        if resources["x"] < (word[0] + word[2]) / 2 < resources["x"] + resources["width"] and resources["top"] < (word[1] + word[3]) / 2 < resources["top"] + resources["height"]:
            assert word[4] not in ["Quintessence", "Fate"], (name, word)
    if name != "browser-simple":
        for i in range(1, 66 if name in ["crowded", "browser-all"] else 6):
            expected = f"Navigation route {i:02}" if name == "browser-all" else f"Route {i:02}"
            assert compact(expected) in compact(text[1]), (name, expected)
    for index, page in enumerate(pdf):
        assert page.rect == pymupdf.Rect(0, 0, 612, 792), (name, index, page.rect)
        assert page.cropbox == page.mediabox
        minimum = 99
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    if not span["text"].strip():
                        continue
                    box = pymupdf.Rect(span["bbox"])
                    assert box.x0 >= 8 and box.y0 >= 8 and box.x1 <= 604 and box.y1 <= 784, (name, index, span)
                    minimum = min(minimum, span["size"])
        assert minimum >= 6.9, (name, index, minimum)
        assert all(font[1] != "n/a" for font in page.get_fonts()), (name, "Fonts must be embedded")
        rules = [drawing for drawing in page.get_drawings() if drawing["color"] == (0, 0, 0) and drawing["width"] >= .5]
        assert len(rules) >= 30, (name, index, len(rules))
        frame = next(drawing["rect"] for drawing in page.get_drawings() if drawing["rect"].width > 590 and drawing["rect"].height > 770)
        assert frame == pymupdf.Rect(9, 9, 603, 783), frame
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(OUT / f"{name}-{index+1}.png")
    assert "Damage" in text[0] and "Spent" in text[0]
    assert "Left" not in text[0].split("Hit Points", 1)[-1].split("Weapon", 1)[0].replace("Left Arm", "").replace("Left Leg", "")
    assert "DEX +2" not in text[0] and "STR +1" not in text[0]
    reports.append({"name": name, "pages": len(pdf), "pagePoints": [612, 792], "marginPoints": 9, "widthCoverage": 594 / 612, "heightCoverage": 774 / 792, "allTextInBounds": True, "embeddedFonts": True, "completeFrontIncludingQuickRolls": True})
    contact = Image.new("RGB", (1224, 1056), "#ddd")
    for index, page in enumerate(pdf):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(.5, .5))
        picture = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        contact.paste(picture, (index % 4 * 306, index // 4 * 528))
        ImageDraw.Draw(contact).text((index % 4 * 306 + 4, index // 4 * 528 + 507), f"{name}: page {index+1}", fill="black")
    contact.save(OUT / f"{name}-contact.png")
native_coverage = []
native_path = OUT / "native-pdf-letter.png"
if native_path.exists():
    screenshot = Image.open(native_path).convert("RGB")
    for y in [int(screenshot.height * fraction) for fraction in [.15, .30, .45]]:
        candidates = []
        # A horizontal grid rule can replace the yellow fill on one scanline.
        for scanline in range(y - 4, y + 5):
            pixels = [screenshot.getpixel((x, scanline)) for x in range(int(screenshot.width * .6))]
            white = [x for x, color in enumerate(pixels) if min(color) > 250]
            yellow = [x for x, (r, g, b) in enumerate(pixels) if r > 245 and 210 < g < 240 and 135 < b < 175]
            if white and yellow:
                candidates.append(((max(yellow) - min(yellow) + 1) / (max(white) - min(white) + 1), scanline))
        ratio, scanline = max(candidates)
        assert ratio > .95, ("Native preview still shrinks the form horizontally", scanline, ratio)
        native_coverage.append({"scanline": scanline, "formToPaperWidth": ratio})
(OUT / "pdf-receipt.json").write_text(json.dumps({"passed": True, "documents": reports, "nativeFullSizeLetterCoverage": native_coverage}, indent=2) + "\n")
print(json.dumps(reports))
