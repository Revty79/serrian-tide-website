import type { ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
export function Field({label,help,children}:{label:string;help:string;children:ReactNode}) {
  return <GuidedField label={label} help={help} className="st-field" controlClassName="st-control">{children}</GuidedField>;
}
