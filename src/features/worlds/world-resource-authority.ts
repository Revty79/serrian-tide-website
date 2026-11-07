/** Update the fresh server decision without rebasing a retained draft. */
export function refreshWorldResourceAuthority<T extends {canEdit:boolean;reason?:string}>(retained:T,fresh:{canEdit:boolean;reason?:string}):T{
 if(retained.canEdit===fresh.canEdit&&retained.reason===fresh.reason)return retained;
 return {...retained,canEdit:fresh.canEdit,...("reason" in retained||"reason" in fresh?{reason:fresh.reason}:{})};
}
