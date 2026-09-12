"""Compare the supplied human Skill workbook and SQL as data; never execute SQL."""

import argparse
import hashlib
import json
import re
from pathlib import Path


def prepare(workbook_path, sql_path):
    workbook = json.loads(workbook_path.read_text(encoding="utf-8"))
    master = next(sheet for sheet in workbook["sheets"] if sheet["name"] == "FINAL MASTER MAP")
    cells = lambda row: {re.sub(r"\d+$", "", address): cell["value"] for address, cell in row["cells"].items()}
    headers = cells(next(row for row in master["rows"] if row["row"] == 3))
    records = []
    for row in master["rows"]:
        if row["row"] <= 3:
            continue
        values = {headers[column]: value for column, value in cells(row).items()}
        records.append({
            "workbookRow": row["row"], "id": int(values["Skill ID"]),
            "name": values["FINAL Skill"], "tier": int(values["Final Tier"]),
            "primaryAttribute": "CHA" if values["Final Attribute"] == "CHR" else values["Final Attribute"], "secondaryAttribute": None,
            "definition": values["FINAL Definition"],
            "parentId": int(values["Final Parent ID"]) if values.get("Final Parent ID") else None,
            "parentName": values.get("FINAL Parent"), "treePath": values["Final Tree Path"],
            "typicalApplications": values.get("Typical Applications", ""),
        })
    sql = sql_path.read_text(encoding="utf-8-sig")
    # Parse only complete literal tuple lines, including escaped apostrophes and semicolons inside definitions.
    literal = r"'((?:[^']|'')*)'"
    skill_pattern = re.compile(r"^\s*\((\d+), " + literal + r", (\d+), " + literal + r", " + literal + r"\)[,;]\s*$")
    parent_pattern = re.compile(r"^\s*\((\d+), (\d+), (\d+)\)[,;]\s*$")
    sql_skills = {}
    sql_parents = {}
    for line in sql.splitlines():
        match = skill_pattern.fullmatch(line)
        if match:
            sid, name, tier, attribute, definition = match.groups()
            assert int(sid) not in sql_skills, f"Duplicate SQL Skill ID {sid}"
            sql_skills[int(sid)] = {"id": int(sid), "name": name.replace("''", "'"), "tier": int(tier), "primaryAttribute": attribute, "definition": definition.replace("''", "'")}
        match = parent_pattern.fullmatch(line)
        if match:
            child, parent, order = map(int, match.groups())
            assert child not in sql_parents, f"Duplicate SQL parent child {child}"
            sql_parents[child] = {"parentId": parent, "sortOrder": order}
    assert len(records) == len(sql_skills) == 637
    by_id = {row["id"]: row for row in records}
    assert len(by_id) == 637 and set(by_id) == set(sql_skills)
    assert len({row["name"].strip().lower() for row in records}) == 637
    assert len(sql_parents) == 596
    expected_counts = {"STR": [4, 13, 38], "DEX": [10, 39, 123], "CON": [4, 14, 34], "INT": [10, 42, 136], "WIS": [7, 24, 59], "CHA": [6, 23, 51]}
    counts = {attribute: [sum(row["primaryAttribute"] == attribute and row["tier"] == tier for row in records) for tier in (1, 2, 3)] for attribute in expected_counts}
    assert counts == expected_counts
    for row in records:
        assert row["definition"].strip()
        assert {key: row[key] for key in sql_skills[row["id"]]} == sql_skills[row["id"]], f"SQL/workbook metadata mismatch #{row['id']}"
        edge = sql_parents.get(row["id"])
        if row["tier"] == 1:
            assert row["parentId"] is None and edge is None
            row["sortOrder"] = None
        else:
            assert edge and edge["parentId"] == row["parentId"]
            parent = by_id[row["parentId"]]
            assert parent["tier"] == row["tier"] - 1
            assert parent["primaryAttribute"] == row["primaryAttribute"]
            assert parent["name"] == row["parentName"]
            row["sortOrder"] = edge["sortOrder"]
        ancestors = []
        node = row
        while node:
            ancestors.insert(0, node["name"])
            node = by_id.get(node["parentId"])
        assert row["treePath"] == " > ".join(ancestors) or row["treePath"] == " → ".join(ancestors), f"Tree path mismatch #{row['id']}: {row['treePath']}"
    tree = next(sheet for sheet in workbook["sheets"] if sheet["name"] == "TREE VIEW")
    tree_ids = []
    for entry in tree["rows"]:
        if entry["row"] <= 3:
            continue
        values = cells(entry)
        row = by_id[int(values["E"])]
        tree_ids.append(row["id"])
        assert ("CHA" if values["A"] == "CHR" else values["A"]) == row["primaryAttribute"] and int(values["F"]) == row["tier"]
        assert values["G"] == row["name"] and values["I"] == row["definition"]
    assert len(tree_ids) == len(set(tree_ids)) == 637
    return {
        "schemaVersion": 1, "sourceFile": workbook["sourceFile"], "sourceSha256": workbook["sourceSha256"],
        "sqlFile": sql_path.name, "sqlSha256": hashlib.sha256(sql_path.read_bytes()).hexdigest(),
        "sourceComparison": {"matchingSkillRecords": 637, "matchingParentRecords": 596, "matchingTreeViewRecords": 637, "attributeTierCounts": counts},
        "records": records,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook_json", type=Path)
    parser.add_argument("sql", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = prepare(args.workbook_json, args.sql)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(json.dumps({key: value for key, value in result.items() if key != "records"}))
