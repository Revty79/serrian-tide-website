import { emptyFormAccessRequirement, type FormAccess, type FormAccessRequirement, type FormAccessType } from "../src/features/forms/form-access";

export function accessRequirement(type: FormAccessType, change: Partial<FormAccessRequirement> = {}): FormAccessRequirement {
  return { ...emptyFormAccessRequirement(`${type}-${change.groupNumber ?? 0}-${change.sortOrder ?? 0}`, 0, type), ...change };
}
export function accessFixture(...requirements: FormAccessRequirement[]): FormAccess {
  return { mode: "requirements", requirements };
}
