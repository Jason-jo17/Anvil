/** Removes undefined object keys (fields the user left blank) at every depth, ready to send as JSON. */
export function pruneUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : pruneUndefined(item)));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = pruneUndefined(item);
    }
    return out;
  }
  return value;
}
