import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const featuresRoot = path.join(repositoryRoot, "src", "features");

async function discoverTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const tests = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...await discoverTests(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      tests.push(path.relative(repositoryRoot, entryPath));
    }
  }

  return tests;
}

const testFiles = (await discoverTests(featuresRoot)).sort();
if (testFiles.length === 0) {
  console.error("validate:unit failed: no src/features/**/*.test.ts files were found.");
  process.exitCode = 1;
} else {
  console.log(`validate:unit discovered ${testFiles.length} feature test files.`);

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", ...testFiles],
      { cwd: repositoryRoot, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`validate:unit terminated by signal ${signal}.`);
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
  });

  if (exitCode === 0) {
    console.log(`validate:unit passed: ${testFiles.length} feature test files.`);
  } else {
    console.error(`validate:unit failed with exit code ${exitCode}.`);
    process.exitCode = exitCode;
  }
}
