import { describe, expect, it } from "vitest";
import { compileValidator } from "./validate";
import type { SchemaObject } from "./types";

const schema: SchemaObject = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 3 },
    count: { type: "integer", minimum: 1 },
    address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    "a/b": { type: "string" },
  },
  required: ["title", "address", "a/b"],
};

function validate(s: SchemaObject, value: unknown) {
  const v = compileValidator(s);
  if (!v.ok) throw new Error(v.error);
  return v.validate(value);
}

describe("compileValidator", () => {
  it("keys required errors at the missing child's path", () => {
    expect(validate(schema, { address: {} })).toMatchObject({
      "/title": ["Required"],
      "/address/city": ["Required"],
      "/a~1b": ["Required"],
    });
  });

  it("keys type and range errors at the instance path with a capitalized message", () => {
    const errors = validate(schema, { title: "ab", count: 0, address: { city: "Oslo" }, "a/b": "x" });
    expect(errors["/title"]?.[0]).toMatch(/^Must NOT have fewer than 3 characters/);
    expect(errors["/count"]?.[0]).toMatch(/^Must be >= 1/);
  });

  it("returns no errors for a valid value", () => {
    expect(validate(schema, { title: "abc", address: { city: "Oslo" }, "a/b": "x" })).toEqual({});
  });

  it("accepts draft-07 schemas by ignoring $schema", () => {
    const draft7 = { $schema: "http://json-schema.org/draft-07/schema#", type: "object", required: ["q"] };
    expect(validate(draft7, {})).toEqual({ "/q": ["Required"] });
  });

  it("keeps validating draft-07 tuple items (zod z.tuple output)", () => {
    const tuple: SchemaObject = {
      type: "object",
      properties: { point: { type: "array", items: [{ type: "number" }, { type: "number" }], additionalItems: false } },
    };
    expect(validate(tuple, { point: [1, 2] })).toEqual({});
    expect(Object.keys(validate(tuple, { point: [1, "x"] }))).toEqual(["/point/1"]);
    expect(Object.keys(validate(tuple, { point: [1, 2, 3] }))).toEqual(["/point"]);
  });

  it("keeps validating draft-04 boolean exclusiveMinimum/exclusiveMaximum", () => {
    const ranged: SchemaObject = {
      type: "object",
      properties: { n: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 10, exclusiveMaximum: false } },
    };
    expect(validate(ranged, { n: 5 })).toEqual({});
    expect(Object.keys(validate(ranged, { n: 0 }))).toEqual(["/n"]);
    expect(validate(ranged, { n: 10 })).toEqual({});
  });

  it("does not rewrite data values that happen to look like keywords", () => {
    const withData: SchemaObject = {
      type: "object",
      properties: { mode: { const: { items: [1, 2] } } },
    };
    expect(validate(withData, { mode: { items: [1, 2] } })).toEqual({});
  });

  it("reports schemas it cannot compile instead of throwing", () => {
    const v = compileValidator({ type: "object", properties: { a: { type: 12 as unknown as string } } });
    expect(v.ok).toBe(false);
  });

  it("caches the compiled validator per schema object", () => {
    expect(compileValidator(schema)).toBe(compileValidator(schema));
  });
});
