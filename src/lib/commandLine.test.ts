import { describe, expect, it } from "vitest";
import { formatCommandLine, parseCommandLine } from "./commandLine";

describe("parseCommandLine", () => {
  it("splits on whitespace", () => {
    expect(parseCommandLine("  npx -y  @modelcontextprotocol/server-everything ")).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
    });
  });

  it("keeps quoted segments with spaces and Windows backslashes intact", () => {
    expect(parseCommandLine('"C:\\Program Files\\nodejs\\node.exe" server.js --name \'my server\'')).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["server.js", "--name", "my server"],
    });
  });

  it("keeps empty quoted arguments", () => {
    expect(parseCommandLine('node s.js ""')).toEqual({ command: "node", args: ["s.js", ""] });
  });

  it("rejects empty input and unclosed quotes with readable messages", () => {
    expect(() => parseCommandLine("   ")).toThrow("Enter a command to run");
    expect(() => parseCommandLine('node "server.js')).toThrow("Unclosed quote in command");
  });
});

describe("formatCommandLine", () => {
  it("quotes only the parts that need it", () => {
    expect(
      formatCommandLine({ command: "C:\\Program Files\\node.exe", args: ["-y", "a b", ""], env: {}, cwd: null }),
    ).toBe('"C:\\Program Files\\node.exe" -y "a b" ""');
  });
});
