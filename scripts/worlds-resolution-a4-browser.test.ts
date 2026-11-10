import {withRegionalEditingFixture} from "./worlds-regional-editing-fixture";
import {resolutionA4Browser} from "./worlds-resolution-a4-browser";
process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE??="artifacts/regions-s43-resolution-a4-browser-1";
withRegionalEditingFixture(async f=>{await resolutionA4Browser(f);await(await import("./worlds-resolution-a4-consumption-checks")).resolutionConsumptionChecks(f);await(await import("./worlds-resolution-a4-restore")).resolutionPairedRestore(f);}).catch(error=>{console.error(error);process.exitCode=1;});
