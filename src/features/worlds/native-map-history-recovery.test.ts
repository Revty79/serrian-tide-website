import assert from "node:assert/strict";
import test from "node:test";
import { emptyNativeHistoryDetails, nativeDetailsPrefix, parseNativeDetails, readNativeDetails, retireNativeDetails,writeNativeDetails,listRetainedNativeDetails } from "./native-map-history-recovery";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { kind: "town" as const, id: id(1) }, prefix = nativeDetailsPrefix(id(2), id(3), target);
class Store {
  values = new Map<string, string>(); get length() { return this.values.size; }
  key(n: number) { return [...this.values.keys()][n] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
test("historical detail recovery separates maps/timelines and preserves other-tab original bytes", () => {
  const store = new Store(), own = prefix + id(4), foreign = prefix + id(5), raw = JSON.stringify({ version: 1, draft: emptyNativeHistoryDetails(0) });
  store.setItem(foreign, raw);
  assert.equal(readNativeDetails(store, nativeDetailsPrefix(id(2), id(8), target), own + "different", id(8), target), undefined);
  const candidate = readNativeDetails(store, prefix, own, id(3), target)!;
  assert.equal(candidate.key, foreign); assert.equal(candidate.value?.draft?.startYear, "0");
  retireNativeDetails(store, own, candidate, prefix + "retained:" + id(6));
  assert.equal(store.getItem(foreign), raw);
  store.setItem(foreign, raw + " ");
  assert.throws(() => retireNativeDetails(store, own, candidate, prefix + "retained:" + id(7)), /Another tab/);
});
test("unreadable historical packets stay exportable and exact requests cannot change destination", () => {
  const store = new Store(), own = prefix + id(4), raw = "{original unreadable bytes";
  store.setItem(own, raw); const candidate = readNativeDetails(store, prefix, own, id(3), target)!;
  assert.equal(candidate.raw, raw); assert.equal(candidate.value, undefined);
  retireNativeDetails(store, own, candidate, prefix + "retained:" + id(6));
  assert.equal(store.getItem(own), null); assert.equal(store.getItem(prefix + "retained:" + id(6)), raw);
  const packet = { pending: { action: "archive", requestId: id(7), timelineId: id(8), target, stateId: id(9), revision: 1 } };
  assert.throws(() => parseNativeDetails(JSON.stringify(packet), id(3), target), /different map or timeline/);
});

test("historical details use byte-matched writes and expose retained packets for review",()=>{
 const store=new Store(),own=prefix+id(4),raw=JSON.stringify({version:1,draft:{...emptyNativeHistoryDetails(100),editing:{stateId:id(9),revision:3}}});
 writeNativeDetails(store,own,null,raw);store.setItem(own,raw+" ");
 assert.throws(()=>writeNativeDetails(store,own,raw,"replacement"),/Another tab/);
 assert.equal(store.getItem(own),raw+" ");
 store.setItem(prefix+"retained:"+id(6),raw);
 const listed=listRetainedNativeDetails(store,prefix,id(3),target);assert.equal(listed.length,1);assert.equal(listed[0].value?.draft?.editing?.revision,3);
});
