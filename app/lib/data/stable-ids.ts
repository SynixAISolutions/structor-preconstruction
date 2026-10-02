// Sample records are built by running the real actions, which mint random ids. This swaps every
// UUID for a fixed one, numbered in order of first appearance, so the server and the browser render
// the same sample and references between records stay intact.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

export function stableIds<T>(value: T, prefix: string): T {
  const seen = new Map<string, string>();
  const swap = (id: string) => { if (!seen.has(id)) seen.set(id, `${prefix}-${seen.size + 1}`); return seen.get(id)!; };
  return JSON.parse(JSON.stringify(value).replace(UUID, swap));
}
