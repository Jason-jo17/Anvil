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
    const copy: SchemaObject = { ...schema };
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
