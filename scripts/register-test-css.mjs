// Node's static React markup tests need CSS module names, not a CSS renderer.
// Actual appearance and overflow are covered by the production browser harness.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module, filename) => {
  const names = [...readFileSync(filename, "utf8").matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((match) => match[1]);
  module.exports = Object.fromEntries(names.map((name) => [name, name]));
};
