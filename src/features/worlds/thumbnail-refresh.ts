import type {GeographicViewport} from "./geographic";
import type {RasterView} from "./raster";
import type {CategoricalView} from "./categorical-raster";

export type GeographicPreviewStatus=Pick<GeographicViewport,"layer"|"context"|"canEdit"|"previewReader">;
export function sameGeographicPreview(view:GeographicViewport,status:GeographicPreviewStatus){
 return !!view.previewReader&&view.previewReader===status.previewReader&&view.context===status.context&&view.canEdit===status.canEdit&&view.layer.mapId===status.layer.mapId&&JSON.stringify(view.layer.surface)===JSON.stringify(status.layer.surface);
}
/** Only freshly authorized, same-reader immutable pixels may survive a preview refresh. */
export function sameRasterPreview(previous:RasterView|CategoricalView|null,next:RasterView|CategoricalView|null){
 if(!previous||!next||!previous.previewReader||previous.previewReader!==next.previewReader||next.archived||!next.preferences.visible)return false;
 return previous.sourceId===next.sourceId&&previous.versionId===next.versionId&&JSON.stringify([previous.grid,previous.level,previous.tiles,"style"in previous.preferences?previous.preferences.style:"classification"])===JSON.stringify([next.grid,next.level,next.tiles,"style"in next.preferences?next.preferences.style:"classification"]);
}
