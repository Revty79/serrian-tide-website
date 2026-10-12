import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTableColumns,getTableName,type Table} from "drizzle-orm";
import * as schema from "../src/db/world-peoples-schema";
import {fieldLabels,loreFamilies,loreDraftSchema,type LoreFamily} from "../src/features/worlds/peoples";

// A human-maintained experience tracker cannot be regenerated from schema coverage.
// Verify the existing inventory without overwriting its decisions or historical baseline.
const inventory=readFileSync("docs/architecture/worlds-creator-coverage.md","utf8").replaceAll("\r\n","\n");
const section=(heading:string)=>{const start=inventory.indexOf(`## ${heading}\n`);assert.ok(start>=0,`Missing ${heading}`);const next=inventory.indexOf("\n## ",start+4);return inventory.slice(start,next<0?undefined:next);};
const common=section("Shared draft fields");
for(const key of Object.keys(loreDraftSchema.shape))assert.ok(common.includes(`| \`${key}\` |`),`Missing common field ${key}`);
const tracker=section("Completion tracker for every creator and supporting form");
for(const [family,title] of Object.entries(loreFamilies)) {
  const fields=section(`${title} (${family})`),exportName=`world${family[0].toUpperCase()}${family.slice(1)}Version`;
  const table=(schema as unknown as Record<string,Table>)[exportName];assert.ok(table,`Missing ${exportName}`);
  const columns=getTableColumns(table);
  for(const key of Object.keys(fieldLabels[family as LoreFamily])) {
    assert.ok(columns[key],`Unmapped ${family}.${key}`);
    assert.ok(fields.includes(`| \`${key}\` /`),`Missing field ${family}.${key}`);
    assert.ok(fields.includes(`\`${getTableName(table)}.${columns[key].name}\``),`Missing storage ${family}.${key}`);
  }
  const row=tracker.split("\n").find(line=>line.startsWith(`| ${title} (\`${family}\`) |`));
  assert.ok(row,`Missing completion statuses for ${family}`);
  assert.equal(row.split("|").length,10,`Six status dimensions required for ${family}`);
}
const supporting=["Participant / connection","Place association / migration","Custom section","Historical name","Personal relationship period","Authored cosmic / institutional period","Historical milestone / event correction","Existing History selection","Date precision","Calendar endpoint / notation","Structured sky cycle","Sky calendar binding","Sky query (read-only)"];
const forms=section("Subordinate forms and every saved subfield");
for(const name of supporting) {
  assert.ok(forms.includes(`| ${name} |`),`Missing supporting form ${name}`);
  const row=tracker.split("\n").find(line=>line.startsWith(`| ${name} |`));
  assert.ok(row,`Missing completion statuses for ${name}`);
  assert.equal(row.split("|").length,10,`Six status dimensions required for ${name}`);
}
console.log(`Verified existing inventory: ${Object.keys(loreFamilies).length} creators, ${Object.values(fieldLabels).reduce((n,fields)=>n+Object.keys(fields).length,0)} typed fields, ${Object.keys(loreDraftSchema.shape).length} common draft fields, ${supporting.length} supporting forms, each with six completion statuses. Human acceptance is not inferred; no files changed.`);
