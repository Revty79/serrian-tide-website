import {createHash} from "node:crypto";

/** Drizzle hashes raw SQL text. Git's Windows checkout can change only its line endings. */
export function migrationHashes(bytes:Uint8Array):string[]{
  const original=Buffer.from(bytes),lf=original.toString("utf8").replaceAll("\r\n","\n");
  return [...new Set([original,Buffer.from(lf),Buffer.from(lf.replaceAll("\n","\r\n"))].map(value=>createHash("sha256").update(value).digest("hex")))];
}
