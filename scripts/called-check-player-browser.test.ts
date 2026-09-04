import { runCalledCheckBrowserWorkflow } from "./called-check-browser-harness";

runCalledCheckBrowserWorkflow("player").catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
