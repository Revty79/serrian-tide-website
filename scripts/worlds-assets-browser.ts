import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {undergroundBrowser} from "./worlds-underground-browser";
export async function assetsBrowser(f:RegionalFixture){process.env.SERRIAN_UNDERGROUND_BROWSER=process.env.SERRIAN_ASSETS_BROWSER==="development"?"development":"production";await undergroundBrowser(f);}
