import { runCalledCheckBrowserWorkflow } from "./called-check-browser-harness";

runCalledCheckBrowserWorkflow("god").catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
