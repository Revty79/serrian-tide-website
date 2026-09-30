import type { MechanicsDiagnostic } from "./models";

// Format limits, not limits on what abilities may mean. Change through a reviewed codec revision.
export const MECHANICS_LIMITS = { bytes: 262144, rules: 100, groups: 20, conditions: 50, references: 50, key: 128, title: 240, text: 16000 } as const;
export class MechanicsValidationError extends Error {
  constructor(public readonly diagnostic: MechanicsDiagnostic) { super(diagnostic.message); this.name = "MechanicsValidationError"; }
}
export function fail(path: string, message: string): never {
  throw new MechanicsValidationError({ code: "invalid-document", path, message: `${path}: ${message}` });
}
export function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "Expected an object.");
  return value as Record<string, unknown>;
}
export function shape(row: Record<string, unknown>, fields: string[], path: string) {
  if (Object.keys(row).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(row, key))) fail(path, "Fields do not match this document type.");
}
export function text(value: unknown, path: string, required = true, maximum: number = MECHANICS_LIMITS.text): string {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) fail(path, `Expected ${required ? "nonblank " : ""}text of at most ${maximum} characters.`);
  return value; // Preserve authored text; never silently trim or reinterpret it.
}
export function key(value: unknown, path: string) { return text(value, path, true, MECHANICS_LIMITS.key); }
export function choice<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(path, "Unsupported value.");
  return value as T;
}
export function list(value: unknown, path: string, maximum: number, nonempty = false): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || (nonempty && value.length === 0)) fail(path, `Expected ${nonempty ? "a nonempty " : "an "}array of at most ${maximum} entries.`);
  return Array.from(value);
}
export function id(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) fail(path, "Expected a positive database ID.");
  return value;
}
export function unique(value: string, seen: Set<string>, path: string) {
  if (seen.has(value)) fail(path, "Duplicate local key.");
  seen.add(value);
}
