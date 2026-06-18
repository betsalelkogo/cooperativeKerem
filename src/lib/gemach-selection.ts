/** Pick the active gemach from URL param when valid, else first owned (stable default). */
export function resolveSelectedGemachId(
  ownedIds: string[],
  urlGemachId: string | null | undefined
): string | undefined {
  if (ownedIds.length === 0) return undefined;
  if (urlGemachId && ownedIds.includes(urlGemachId)) return urlGemachId;
  return ownedIds[0];
}

export function withGemachIdQuery(path: string, gemachId?: string): string {
  if (!gemachId) return path;
  const [base, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("gemachId", gemachId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
