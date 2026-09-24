import { describe, expect, it } from "vitest";
import { pruneUndefined } from "./prune";

describe("pruneUndefined", () => {
  it("drops undefined keys at every depth and keeps null, false, 0 and empty strings", () => {
    expect(pruneUndefined({ a: undefined, b: null, c: { d: undefined, e: 0, f: "" }, g: false })).toStrictEqual({
      b: null,
      c: { e: 0, f: "" },
      g: false,
    });
  });

  it("turns undefined array items into null so positions are preserved", () => {
    expect(pruneUndefined([1, undefined, { x: undefined }])).toStrictEqual([1, null, {}]);
  });
});
