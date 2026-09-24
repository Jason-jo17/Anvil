import { describe, expect, it } from "vitest";
import { resolveRef } from "./resolve";
import type { SchemaObject } from "./types";

const root: SchemaObject = {
  $defs: {
    Address: { type: "object", title: "Address", properties: { city: { type: "string" } } },
    "a/b": { type: "string" },
    A: { $ref: "#/$defs/B" },
    B: { $ref: "#/$defs/A" },
  },
  definitions: { Legacy: { type: "integer" } },
};

describe("resolveRef", () => {
  it("resolves $defs and lets sibling keywords override the target", () => {
    const r = resolveRef(root, { $ref: "#/$defs/Address", title: "Shipping address" });
    expect(r.cyclic).toBe(false);
    expect(r.schema.type).toBe("object");
    expect(r.schema.title).toBe("Shipping address");
    expect(r.schema.$ref).toBeUndefined();
    expect([...r.seen]).toEqual(["#/$defs/Address"]);
  });

  it("resolves legacy definitions and escaped pointer tokens", () => {
    expect(resolveRef(root, { $ref: "#/definitions/Legacy" }).schema.type).toBe("integer");
    expect(resolveRef(root, { $ref: "#/$defs/a~1b" }).schema.type).toBe("string");
  });

  it("reports ref-to-ref cycles instead of looping", () => {
    expect(resolveRef(root, { $ref: "#/$defs/A" }).cyclic).toBe(true);
  });

  it("reports a ref already seen on this path as cyclic", () => {
    expect(resolveRef(root, { $ref: "#/$defs/Address" }, new Set(["#/$defs/Address"])).cyclic).toBe(true);
  });

  it("reports unresolvable and external refs", () => {
    expect(resolveRef(root, { $ref: "#/$defs/Missing" }).unresolved).toBe("#/$defs/Missing");
    expect(resolveRef(root, { $ref: "https://example.com/s.json" }).unresolved).toBe("https://example.com/s.json");
  });

  it("treats a malformed percent-escape in a ref as unresolved instead of throwing", () => {
    expect(resolveRef(root, { $ref: "#/$defs/100%off" }).unresolved).toBe("#/$defs/100%off");
  });

  it("passes schemas without $ref through unchanged", () => {
    const s = { type: "string" };
    expect(resolveRef(root, s)).toMatchObject({ schema: s, cyclic: false });
    expect(resolveRef(root, true).schema).toEqual({});
  });
});
