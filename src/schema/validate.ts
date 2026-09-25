import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { childPath } from "./pointer";
import type { FieldErrors, Schema, SchemaObject } from "./types";

export type Validator = { ok: true; validate: (value: unknown) => FieldErrors } | { ok: false; error: string };

const cache = new WeakMap<object, Validator>();
const ACCEPT_ALL: Validator = { ok: true, validate: () => ({}) };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function toFieldErrors(errors: ErrorObject[]): FieldErrors {
  const out: FieldErrors = {};
  for (const error of errors) {
    // Summary errors for unions repeat what the branch errors already say.
    if (error.keyword === "anyOf" || error.keyword === "oneOf") continue;
    const missing = error.keyword === "required" ? (error.params as { missingProperty: string }).missingProperty : null;
    const path = missing === null ? error.instancePath : childPath(error.instancePath, missing);
    const message = missing === null ? capitalize(error.message ?? "invalid value") : "Required";
    (out[path] ??= []).push(message);
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Keywords whose values are data, not subschemas: never rewrite inside them. */
const DATA_KEYWORDS = new Set(["const", "enum", "default", "examples"]);
/** Keywords whose values map names to subschemas: the names are not keywords. */
const SCHEMA_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);

/**
 * Rewrites older-draft keywords that Ajv 2020 rejects outright into their 2020-12 equivalents, so one legacy
 * property doesn't switch validation off for the whole tool:
 * - draft-04..07 tuple `items: [..]` (+ `additionalItems`) → `prefixItems` (+ `items`)
 * - draft-04 boolean `exclusiveMinimum`/`exclusiveMaximum` → numeric bounds
 */
export function normalizeLegacyKeywords(schema: unknown): unknown {
  if (!isPlainObject(schema)) return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DATA_KEYWORDS.has(key)) out[key] = value;
    else if (SCHEMA_MAPS.has(key) && isPlainObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, normalizeLegacyKeywords(sub)]));
    } else if (Array.isArray(value)) out[key] = value.map(normalizeLegacyKeywords);
    else out[key] = normalizeLegacyKeywords(value);
  }

  if (Array.isArray(out.items)) {
    out.prefixItems = out.items;
    delete out.items;
    if ("additionalItems" in out) {
      out.items = out.additionalItems;
      delete out.additionalItems;
    }
  }
  for (const [bound, exclusive] of [
    ["minimum", "exclusiveMinimum"],
    ["maximum", "exclusiveMaximum"],
  ] as const) {
    if (typeof out[exclusive] !== "boolean") continue;
    if (out[exclusive] === true && typeof out[bound] === "number") {
      out[exclusive] = out[bound];
      delete out[bound];
    } else {
      delete out[exclusive];
    }
  }
  return out;
}

/** Compiles a tool's input schema with Ajv (JSON Schema 2020-12). Never throws: bad schemas report `ok: false`. */
export function compileValidator(schema: Schema): Validator {
  if (typeof schema === "boolean") return ACCEPT_ALL;
  const hit = cache.get(schema);
  if (hit) return hit;

  let validator: Validator;
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    // Servers often declare draft-07 via $schema (zod-to-json-schema). Ajv2020 would reject that meta-schema, and
    // the keywords we render are compatible, so validate everything as 2020-12.
    const copy = normalizeLegacyKeywords(schema) as SchemaObject;
    delete copy.$schema;
    const validate = ajv.compile(copy);
    validator = {
      ok: true,
      validate: (value) => {
        validate(value);
        return toFieldErrors(validate.errors ?? []);
      },
    };
  } catch (e) {
    validator = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(schema, validator);
  return validator;
}
