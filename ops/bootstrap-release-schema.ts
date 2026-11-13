/** Exact reviewed release identities. No range or inferred future-schema trust. */
export function bootstrapReleaseSupported(journal:{entries:{tag:string}[]}){
 const tags:Record<number,string>={162:"0161_atlas_expanded_numerical_terrain",163:"0162_atlas_source_rights",164:"0163_atlas_refinement_expansion"};
 return tags[journal.entries.length]!==undefined&&tags[journal.entries.length]===journal.entries.at(-1)?.tag;
}
