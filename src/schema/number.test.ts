import { describe, expect, it } from "vitest";
import { parseNumberInput } from "./number";

describe("parseNumberInput", () => {
  it.each([
    ["", false, { ok: true, value: undefined }],
    ["  ", false, { ok: true, value: undefined }],
    ["42", true, { ok: true, value: 42 }],
    ["-1.5", false, { ok: true, value: -1.5 }],
    ["1e3", true, { ok: true, value: 1000 }],
    ["abc", false, { ok: false, error: "Enter a number" }],
    ["1,5", false, { ok: false, error: "Enter a number" }],
    ["1.5", true, { ok: false, error: "Enter a whole number" }],
    ["Infinity", false, { ok: false, error: "Enter a number" }],
  ])("%j (integer=%s)", (text, integer, expected) => {
    expect(parseNumberInput(text, integer)).toEqual(expected);
  });
});
