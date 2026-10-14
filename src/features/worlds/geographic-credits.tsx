import styles from "./geographic.module.css";
export type GeographicCredit={label:string;url:string;license:string;observationPeriod?:string};
/** Required raster credit stays visible beside imagery even when controls are folded. */
export function GeographicCredits({elevation,landCover}:{elevation:GeographicCredit|null;landCover:GeographicCredit|null}){
 if(!elevation&&!landCover)return null;
 return <aside className={styles.imageCredits} aria-label="Geographic source credit">{[elevation,landCover].map((credit,i)=>credit&&<p key={i}>{credit.label}{credit.observationPeriod?` · ${credit.observationPeriod}`:""} · <a href={credit.url} target="_blank" rel="noreferrer">{credit.license}</a></p>)}</aside>;
}
export function GeographicRasterFeedback({elevation,landCover}:{elevation:{error:string;retry:()=>void};landCover:{error:string;retry:()=>void}}){
 if(!elevation.error&&!landCover.error)return null;
 return <div className={styles.imageCredits} data-geographic-raster-feedback>{elevation.error&&<p role="alert">Terrain relief: {elevation.error} <button className="st-button is-secondary" onClick={elevation.retry}>Retry terrain relief</button></p>}{landCover.error&&<p role="alert">Land cover: {landCover.error} <button className="st-button is-secondary" onClick={landCover.retry}>Retry land cover</button></p>}</div>;
}
