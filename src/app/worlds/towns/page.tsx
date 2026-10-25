import Link from "next/link";
import {requireGodOrAdminAccessContext} from "@/lib/server-access";
import {listWorlds} from "@/features/worlds/world-service";
import {WorldCover} from "@/features/worlds/world-registry";
import styles from "@/features/worlds/worlds.module.css";
export const dynamic="force-dynamic";
export default async function WorldTownsSelection({searchParams}:{searchParams:Promise<{section?:string}>}){
 const {session}=await requireGodOrAdminAccessContext();const worlds=await listWorlds(session.user.id);
 const section=(await searchParams).section==="shops"?"shops":"towns";
 return <main className={styles.page}><div className={styles.content}><Link className="st-button is-secondary" href="/worlds">World registry</Link><header className={styles.registryHero}><div><p className={styles.eyebrow}>Worlds creator workshop</p><h1>Towns and shops</h1><p className={styles.lead}>Choose the World where you want to create settlements, businesses, places and inhabitants.</p><p>The Town and Shop Builders now live inside Worlds.</p></div></header><div className={styles.gallery}>{worlds.map(world=><article className={styles.worldCard} key={world.id}><WorldCover world={world}/><div className={styles.content}><h2>{world.name}</h2><p>{world.description}</p><Link className="st-button is-primary" href={`/worlds/${world.id}?tab=towns&townSection=${section}`}>{world.archived?"Read archived towns and shops":"Open towns and shops"}</Link></div></article>)}</div>{!worlds.length&&<p>Create a World in the registry, then open its Towns workspace. Towns and Shops do not require a Campaign.</p>}</div></main>;
}
