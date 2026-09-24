import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it } from "vitest";
import { AnvilError, ipc } from "./ipc";

const spec = { command: "npx", args: ["-y", "x"], env: {}, cwd: null };

describe("ipc", () => {
  it("sends camelCase arguments to the Rust commands", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "connect_stdio") return { connectionId: "c1", server: { name: "s", version: "1" } };
      return null;
    });
    await ipc.connectStdio(spec, true);
    await ipc.callTool("c1", "echo", { message: "hi" });
    expect(calls[0]).toEqual({ cmd: "connect_stdio", args: expect.objectContaining({ spec, consented: true }) });
    expect(calls[1]).toEqual({
      cmd: "call_tool",
      args: expect.objectContaining({ connectionId: "c1", name: "echo", arguments: { message: "hi" } }),
    });
  });

  it("turns IpcError payloads into AnvilError with kind and stderr tail", async () => {
    mockIPC(() => {
      throw { kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom"] };
    });
    const error = await ipc.connectStdio(spec, true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnvilError);
    expect(error).toMatchObject({ kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom"] });
  });

  it("wraps anything else as an unknown error", async () => {
    mockIPC(() => {
      throw "plain string";
    });
    const error = await ipc.listTools("c1").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "unknown", message: "plain string", stderrTail: [] });
  });
});
