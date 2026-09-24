import { decodePointerToken } from "./pointer";
import { asObject, type Schema, type SchemaObject } from "./types";

/** Nesting beyond this renders as raw JSON. It guards against pathological schemas. */
export const MAX_FORM_DEPTH = 8;
const MAX_REF_HOPS = 32;

export interface Resolved {
  schema: SchemaObject;
  seen: ReadonlySet<string>;
  cyclic: boolean;
  unresolved?: string;
}

/** Looks up a same-document JSON Pointer ref ("#", "#/$defs/X"). Anchors and external refs return undefined. */
export function lookupPointer(root: SchemaObject, ref: string): Schema | undefined {
  if (!ref.startsWith("#")) return undefined;
  const pointer = ref.slice(1);
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let node: unknown = root;
  for (const token of pointer.slice(1).split("/")) {
    if (node === null || typeof node !== "object") return undefined;
    let key: string;
    try {
      key = decodePointerToken(token);
    } catch {
      return undefined; // Malformed %-escape from the server: treat the ref as unresolvable, never crash.
    }
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node === "boolean") return node;
  return node !== null && typeof node === "object" ? (node as SchemaObject) : undefined;
}

/**
 * Follows $ref chains. `seen` holds the refs already expanded on this path from the root; meeting one again means
 * the schema is recursive, and the caller should stop expanding.
 */
export function resolveRef(root: SchemaObject, schema: Schema, seen: ReadonlySet<string> = new Set()): Resolved {
  let current = asObject(schema);
  const nextSeen = new Set(seen);
  let hops = 0;
  while (typeof current.$ref === "string") {
    const ref = current.$ref;
    if (nextSeen.has(ref) || hops++ >= MAX_REF_HOPS) return { schema: current, seen: nextSeen, cyclic: true };
    nextSeen.add(ref);
    const siblings: SchemaObject = { ...current };
    delete siblings.$ref;
    const target = lookupPointer(root, ref);
    if (target === undefined) return { schema: siblings, seen: nextSeen, cyclic: false, unresolved: ref };
    current = { ...asObject(target), ...siblings };
  }
  return { schema: current, seen: nextSeen, cyclic: false };
}
