import type { ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
export function Field({label,help,children,path}:{label:string;help:string;children:ReactNode;path?:string}) {
  const field=<GuidedField label={label} help={help} className="st-field" controlClassName="st-control">{children}</GuidedField>;
  return path?<div data-draft-path={path}>{field}</div>:field;
}
