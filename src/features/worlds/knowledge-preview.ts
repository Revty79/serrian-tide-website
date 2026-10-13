type Query = Pick<URLSearchParams, "get">;

/** Both supported preview URLs have the same server and client privacy boundary. */
export function ordinaryKnowledge(query: Query): boolean {
  return query.get("knowledge") === "ordinary" || query.get("ordinary") === "1";
}

export function readOnlyPreview(query: Query): boolean {
  return query.get("review") === "1" || ordinaryKnowledge(query);
}

export function authorKnowledge(query: URLSearchParams): void {
  query.delete("ordinary");
  if (query.get("knowledge") === "ordinary") query.delete("knowledge");
}
