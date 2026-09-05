import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

function jsxTagName(node: ts.JsxOpeningLikeElement): string | null {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : null;
}

test("every button inside a form declares whether it submits", () => {
  const failures: string[] = [];
  for (const filePath of sourceFiles(path.resolve("src/app"))) {
    const source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    function visit(node: ts.Node, formDepth: number): void {
      const nextFormDepth = ts.isJsxElement(node) && jsxTagName(node.openingElement) === "form"
        ? formDepth + 1
        : formDepth;
      if (
        nextFormDepth > 0 &&
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        jsxTagName(node) === "button" &&
        !node.attributes.properties.some((attribute) => (
          ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "type"
        ))
      ) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(`${path.relative(process.cwd(), filePath)}:${position.line + 1}`);
      }
      ts.forEachChild(node, (child) => visit(child, nextFormDepth));
    }

    visit(source, 0);
  }

  assert.deepEqual(failures, [], `Buttons without an explicit type inside a form:\n${failures.join("\n")}`);
});
