"use client";
import {memo} from "react";
import {assetColors,type ArtworkAsset} from "./terrain-artwork-assets";
import type {ArtworkLayer} from "./terrain-artwork";
export const ArtworkPreview=memo(function ArtworkPreview({asset,theme="natural"}:{asset:ArtworkAsset;theme?:ArtworkLayer["theme"]}){const colors=assetColors(asset.pack,theme,asset.key);return <svg viewBox="0 0 128 96" width="128" height="96" aria-hidden="true">{asset.paths.map((p,i)=><path key={i} d={p.d} fill={p.stroke?"none":colors[p.role]} stroke={p.stroke?colors[p.role]:asset.pack==="fantasy"?colors.ink:"none"} strokeWidth={p.stroke?p.width:asset.pack==="fantasy"?.8:0} strokeLinejoin="round" strokeLinecap="round"/>)}</svg>;});
