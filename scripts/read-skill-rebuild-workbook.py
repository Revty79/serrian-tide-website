"""Read XLSX cells without changing the source workbook; emit auditable JSON."""

import argparse
import hashlib
import json
import posixpath
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile


def read_workbook(source):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    relationship_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with ZipFile(source) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(item.itertext()) for item in root.findall("s:si", ns)]
        relations = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = []
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.findall("s:sheets/s:sheet", ns):
            target = relations[sheet.attrib[f"{{{relationship_ns}}}id"]]
            sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            root = ET.fromstring(archive.read(sheet_path))
            rows = []
            for row in root.findall("s:sheetData/s:row", ns):
                cells = {}
                for cell in row.findall("s:c", ns):
                    value = cell.find("s:v", ns)
                    text = value.text if value is not None else ""
                    if cell.get("t") == "s":
                        text = shared[int(text)]
                    elif cell.get("t") == "inlineStr":
                        text = "".join(cell.find("s:is", ns).itertext())
                    formula = cell.find("s:f", ns)
                    if text or formula is not None:
                        cells[cell.attrib["r"]] = {"value": text, **({"formula": formula.text} if formula is not None else {})}
                if cells:
                    rows.append({"row": int(row.attrib["r"]), "cells": cells})
            sheets.append({"name": sheet.attrib["name"], "rows": rows})
    return {"sourceFile": source.name, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "sheets": sheets}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = read_workbook(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceSha256": result["sourceSha256"], "sheets": [{"name": sheet["name"], "rowCount": len(sheet["rows"]), "firstRows": sheet["rows"][:4]} for sheet in result["sheets"]]}, ensure_ascii=True))
