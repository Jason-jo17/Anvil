# ADR-0002: Custom JSON-Schema form renderer on Ajv 2020-12

Status: Accepted, 2026-09-24

## Context
The spec allows RJSF or a custom renderer. Forms must render `$ref`, `anyOf`/`oneOf`, enums, nested objects and arrays,
validate with inline errors, round-trip through a raw-JSON view, and reuse the design tokens and a11y rules. The same
renderer will render MRTR elicitation forms later.

## Decision
Build a small custom renderer (`src/components/schema-form`) over Ajv 2020-12 (`ajv/dist/2020`) + `ajv-formats`.

## Consequences
- Full control of markup, ARIA wiring, tokens and error placement; no theme layer to fight.
- We own edge cases RJSF would handle. Unsupported constructs (`allOf`, tuples, multi-type unions, free-form
  objects, recursion) fall back to a per-field raw-JSON editor rather than failing.
- `$schema` is stripped before compiling so draft-07 schemas (zod-to-json-schema output) still validate.
