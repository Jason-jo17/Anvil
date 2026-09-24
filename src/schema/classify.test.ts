import { describe, expect, it } from "vitest";
import { classify } from "./classify";

describe("classify", () => {
  it.each([
    [{ type: "string" }, "string"],
    [{ type: "number" }, "number"],
    [{ type: "integer" }, "integer"],
    [{ type: "boolean" }, "boolean"],
    [{ type: "object" }, "object"],
    [{ type: "array", items: { type: "string" } }, "array"],
    [{ enum: ["a", "b"] }, "enum"],
    [{ const: "fixed" }, "const"],
    [{ type: ["string", "null"] }, "string"],
    [{ properties: { a: { type: "string" } } }, "object"],
    [{ items: { type: "string" } }, "array"],
    [{ type: ["string", "number"] }, "unknown"],
    [{ allOf: [{ type: "string" }] }, "unknown"],
  ])("%j is %s", (schema, kind) => {
    expect(classify(schema).kind).toBe(kind);
  });

  it("collapses Optional[X] (anyOf with null) to a delegate for X", () => {
    const c = classify({ anyOf: [{ type: "string" }, { type: "null" }], default: null });
    expect(c).toEqual({ kind: "delegate", inner: { type: "string" } });
  });

  it("keeps real unions and drops the null branch", () => {
    const a = { type: "object", properties: { id: { type: "integer" } } };
    const b = { type: "object", properties: { name: { type: "string" } } };
    expect(classify({ oneOf: [a, b, { type: "null" }] })).toEqual({ kind: "union", branches: [a, b] });
  });

  it("treats anyOf on an object with properties as a constraint, not a union", () => {
    expect(classify({ type: "object", properties: { a: {} }, anyOf: [{ required: ["a"] }] }).kind).toBe("object");
  });
});
