"""Capture only the eight public print layouts; never retain formula caches or other tabs.

Usage: python scripts/capture-character-spreadsheet-template.py <export.xlsx>
The Google workbook is a read-only design source. App rules supply every filled value.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

N = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
TITLES = ["Sheet front filled", "Skills Back", "Spellcraft Back", "Talisman Back", "Faith Back", "Psyonics Back", "Bardic Resonance Back", "Special Abilities Back"]


def position(address):
    letters, row = re.fullmatch(r"([A-Z]+)(\d+)", address).groups()
    col = 0
    for letter in letters:
        col = col * 26 + ord(letter) - 64
    return int(row) - 1, col - 1


def capture(source):
    archive = zipfile.ZipFile(source)
    xml = lambda name: ET.fromstring(archive.read(name))
    strings = ["".join(cell.itertext()) for cell in xml("xl/sharedStrings.xml")]
    styles = xml("xl/styles.xml")
    fonts, fills, borders, xfs = [styles.find("m:" + name, N) for name in ["fonts", "fills", "borders", "cellXfs"]]
    theme = xml("xl/theme/theme1.xml")
    ns_a = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    colors = [list(entry)[0].get("lastClr", list(entry)[0].get("val")) for entry in theme.find("a:themeElements/a:clrScheme", ns_a)]

    def color(node, default="#000000"):
        if node is None:
            return default
        return "#" + (node.get("rgb", "")[-6:] or colors[int(node.get("theme", "1"))])

    def style(index):
        xf = xfs[index]
        font, fill, border = fonts[int(xf.get("fontId"))], fills[int(xf.get("fillId"))], borders[int(xf.get("borderId"))]
        attr = lambda key, fallback: font.find("m:" + key, N).get("val") if font.find("m:" + key, N) is not None else fallback
        align = xf.find("m:alignment", N)
        align = align.attrib if align is not None else {}
        pattern = fill.find("m:patternFill", N)
        result = {"fontFamily": attr("name", "Arial"), "fontSize": float(attr("sz", 14)), "fontWeight": 700 if font.find("m:b", N) is not None else 400,
                  "color": color(font.find("m:color", N)), "backgroundColor": color(pattern.find("m:fgColor", N), "#ffffff") if pattern is not None and pattern.get("patternType") == "solid" else "#ffffff",
                  "textAlign": align.get("horizontal", "left"), "vertical": align.get("vertical", "bottom"), "wrap": align.get("wrapText") == "1"}
        for edge in ["top", "right", "bottom", "left"]:
            side = border.find("m:" + edge, N)
            if side is not None and side.get("style"):
                weight = {"hair": .25, "thin": .5, "medium": 1, "thick": 1.5, "double": 1.5}.get(side.get("style"), .5)
                result["border" + edge.title()] = f"{weight}pt {'double' if side.get('style') == 'double' else 'solid'} {color(side.find('m:color', N))}"
        return result

    sheets, used = [], set()
    workbook = xml("xl/workbook.xml")
    for title in TITLES:
        index = next(i for i, sheet in enumerate(workbook.find("m:sheets", N)) if sheet.get("name") == title)
        sheet = xml(f"xl/worksheets/sheet{index + 1}.xml")
        rows, cols = (60, 11) if index == 19 else (52, 8) if title == "Psyonics Back" else (54, 8) if title == "Special Abilities Back" else (51, 8)
        widths = [12.63] * cols
        for col in sheet.findall("m:cols/m:col", N):
            for i in range(int(col.get("min")) - 1, min(int(col.get("max")), cols)):
                widths[i] = float(col.get("width"))
        # Excel widths are measured in the default font's digit widths; seven pixels plus five padding.
        widths = [round((width * 7 + 5) * .75, 3) for width in widths]
        heights = [15.75] * rows
        cells = {}
        for row in sheet.findall("m:sheetData/m:row", N):
            heights[int(row.get("r")) - 1] = float(row.get("ht", "15.75"))
            for cell in row:
                address = cell.get("r")
                r, c = position(address)
                if r >= rows or c >= cols:
                    continue
                sid = int(cell.get("s", "0"))
                value = cell.find("m:v", N)
                # No caches, formulas, source character values, comments or private workbook metadata.
                text = strings[int(value.text)] if cell.get("t") == "s" and value is not None and cell.find("m:f", N) is None else ""
                if title == "Sheet front filled" and address == "I35":
                    text = ""  # Anatomy is read from the saved character, not the template's humanoid example.
                cells[address] = [sid, text]
                used.add(sid)
        sheets.append({"title": title, "widths": widths, "heights": heights, "merges": [merge.get("ref") for merge in sheet.findall("m:mergeCells/m:mergeCell", N)], "cells": cells})
    output = {"source": "https://docs.google.com/spreadsheets/d/1iVoWXAvnI309fw8lKOa0uD6Ct1i0kfSgQ1kIZ92-Xu0/edit", "captured": "2026-11-01", "sourceSha256": hashlib.sha256(Path(source).read_bytes()).hexdigest(), "paper": {"color": "#000000", "backgroundColor": "#ffffff"}, "styles": {str(index): style(index) for index in sorted(used)}, "sheets": sheets}
    target = Path("src/features/characters/spreadsheet-character-template.json")
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Captured {len(sheets)} print layouts, {len(used)} styles, {target.stat().st_size} bytes; no formulas or cached character values.")


if __name__ == "__main__":
    capture(sys.argv[1])
