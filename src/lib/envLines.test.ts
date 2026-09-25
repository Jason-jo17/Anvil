import { describe, expect, it } from "vitest";
import { parseEnvLines } from "./envLines";

describe("parseEnvLines", () => {
  it("reads NAME=value lines, keeping everything after the first = as the value", () => {
    expect(parseEnvLines("GITHUB_TOKEN=ghp_abc\nQUERY=a=b&c=d\r\n")).toEqual({
      ok: true,
      env: { GITHUB_TOKEN: "ghp_abc", QUERY: "a=b&c=d" },
    });
  });

  it("skips blank lines and # comments", () => {
    expect(parseEnvLines("\n# token for the API\n  \nKEY=1\n")).toEqual({ ok: true, env: { KEY: "1" } });
  });

  it("allows empty values and keeps inner spaces", () => {
    expect(parseEnvLines("EMPTY=\nGREETING=hello world")).toEqual({
      ok: true,
      env: { EMPTY: "", GREETING: "hello world" },
    });
  });

  it("names the first bad line", () => {
    expect(parseEnvLines("OK=1\nnot a pair")).toEqual({ ok: false, error: "Line 2: expected NAME=value" });
    expect(parseEnvLines("1BAD=x")).toEqual({
      ok: false,
      error: "Line 1: 1BAD is not a valid variable name",
    });
  });

  it("treats empty input as no variables", () => {
    expect(parseEnvLines("")).toEqual({ ok: true, env: {} });
  });
});
