import type { Schema, SchemaObject } from "./types";

type SimpleKind = "string" | "number" | "integer" | "boolean" | "object" | "array" | "enum" | "const" | "unknown";

export type Classified =
  | { kind: "delegate"; inner: Schema }
  | { kind: "union"; branches: Schema[] }
  | { kind: SimpleKind };

const TYPE_KINDS = new Set(["string", "number", "integer", "boolean", "object", "array"]);

function isNullSchema(schema: Schema): boolean {
  if (typeof schema !== "object") return false;
  if (schema.type === "null") return true;
  return Array.isArray(schema.type) && schema.type.length === 1 && schema.type[0] === "null";
}

/** Decides which widget a (ref-resolved) schema gets. Structural only: never resolves $ref itself. */
export function classify(schema: SchemaObject): Classified {
  if ("const" in schema) return { kind: "const" };
  if (Array.isArray(schema.enum)) return { kind: "enum" };

  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union) && schema.type === undefined && schema.properties === undefined) {
    const nonNull = union.filter((branch) => !isNullSchema(branch));
    if (nonNull.length === 0) return { kind: "unknown" };
    // Optional[X] from pydantic/zod, or a single-branch anyOf: render X.
    if (nonNull.length === 1) return { kind: "delegate", inner: nonNull[0]! };
    return { kind: "union", branches: nonNull };
  }

  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const nonNullTypes = types.filter((t) => t !== "null");
  if (nonNullTypes.length === 1) {
    const type = nonNullTypes[0]!;
    return TYPE_KINDS.has(type) ? { kind: type as SimpleKind } : { kind: "unknown" };
  }
  if (types.length === 0) {
    if (schema.properties) return { kind: "object" };
    if (schema.items) return { kind: "array" };
  }
  return { kind: "unknown" };
}
