import { describe, expect, it } from "vitest";
import { initialValue } from "./defaults";
import type { SchemaObject } from "./types";

describe("initialValue", () => {
  it("initializes required fields only, using their defaults", () => {
    const schema: SchemaObject = {
      type: "object",
      properties: {
        mode: { type: "string", default: "fast" },
        limit: { type: "integer", default: 10 },
        name: { type: "string" },
        verbose: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        extra: { type: "array", items: { type: "string" } },
      },
      required: ["mode", "name", "verbose", "tags"],
    };
    expect(initialValue(schema, schema)).toStrictEqual({ mode: "fast", verbose: false, tags: [] });
  });

  it("initializes required nested objects and skips optional ones", () => {
    const schema: SchemaObject = {
      type: "object",
      $defs: { Address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
      properties: { home: { $ref: "#/$defs/Address" }, work: { $ref: "#/$defs/Address" } },
      required: ["home"],
    };
    expect(initialValue(schema, schema)).toStrictEqual({ home: {} });
  });

  it("uses const values and the first union branch", () => {
    const schema: SchemaObject = {
      type: "object",
      properties: {
        kind: { const: "search" },
        target: { anyOf: [{ type: "object", properties: {} }, { type: "string" }] },
      },
      required: ["kind", "target"],
    };
    expect(initialValue(schema, schema)).toStrictEqual({ kind: "search", target: {} });
  });

  it("terminates on recursive schemas", () => {
    const schema: SchemaObject = {
      $defs: { Node: { type: "object", properties: { child: { $ref: "#/$defs/Node" } }, required: ["child"] } },
      $ref: "#/$defs/Node",
    };
    expect(initialValue(schema, schema)).toStrictEqual({});
  });

  it("returns copies of defaults, not the schema's own objects", () => {
    const schema: SchemaObject = { type: "object", default: { a: [1] } };
    const value = initialValue(schema, schema) as { a: number[] };
    value.a.push(2);
    expect(schema.default).toEqual({ a: [1] });
  });
});
