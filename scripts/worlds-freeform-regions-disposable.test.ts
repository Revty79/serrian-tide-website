import {withRegionalEditingFixture} from "./worlds-regional-editing-fixture";
import {freeformDatabase} from "./worlds-freeform-regions-db-checks";
import {regionalEditingDatabase} from "./worlds-regional-editing-db-checks";
withRegionalEditingFixture(async fixture=>{if(process.env.SERRIAN_REGIONAL_EDIT_SKIP_DB!=="1"){await freeformDatabase(fixture);await regionalEditingDatabase(fixture);}if(process.env.SERRIAN_REGIONAL_EDIT_BROWSER)await(await import("./worlds-regional-editing-browser-checks")).regionalEditingBrowser(fixture);}).catch(error=>{console.error(error);process.exitCode=1;});
