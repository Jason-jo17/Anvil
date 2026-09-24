import { classify } from "./classify";
import { MAX_FORM_DEPTH, resolveRef } from "./resolve";
import type { Schema, SchemaObject } from "./types";

const cloneJson = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * The starting value for a form. Only required fields are filled in (from their default where one exists), so
 * we send what the user set and what the schema demands, and never invent values for optional fields.
 */
export function initialValue(
  root: SchemaObject,
  schema: Schema,
  seen: ReadonlySet<string> = new Set(),
  required = true,
  depth = 0,
): unknown {
  const resolved = resolveRef(root, schema, seen);
  if (resolved.cyclic || resolved.unresolved || depth > MAX_FORM_DEPTH) return undefined;
  const s = resolved.schema;
  if (s.default !== undefined) return cloneJson(s.default);

  const c = classify(s);
  switch (c.kind) {
    case "const":
      return cloneJson(s.const);
    case "union":
      return initialValue(root, c.branches[0]!, resolved.seen, required, depth + 1);
    case "boolean":
      return required ? false : undefined;
    case "array":
      return required ? [] : undefined;
    case "object": {
      if (!required) return undefined;
      const out: Record<string, unknown> = {};
      const requiredKeys = new Set(s.required ?? []);
      for (const [key, prop] of Object.entries(s.properties ?? {})) {
        if (!requiredKeys.has(key)) continue;
        const value = initialValue(root, prop, resolved.seen, true, depth + 1);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    default:
      return undefined;
  }
}
