import {checkRegionalRasterSeams} from "./worlds-regional-raster-seams";
import {checkRegionsBrowser} from "./worlds-regions-browser-checks";
import {checkRegionalStorage} from "./worlds-regional-storage-checks";
import {createRegionalQualityFixture} from "./worlds-regional-quality-fixture";
import {captureRegionalQuality} from "./worlds-regional-quality-captures";
import {checkRegionalPrecision} from "./worlds-regional-precision-browser";
export async function checkRegionalQualityBrowser(options:Parameters<typeof checkRegionsBrowser>[0]){
 await checkRegionsBrowser(options);
 await checkRegionalRasterSeams(options);
 await checkRegionalStorage(options);
 const fixture=await createRegionalQualityFixture(options);
 await captureRegionalQuality(options,fixture);
 await checkRegionalPrecision({...options,world:fixture.world},fixture);
}
