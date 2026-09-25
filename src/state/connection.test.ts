import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { AnvilError } from "../lib/ipc";
import { resetConnectionStore, useConnection } from "./connection";

const spec = { command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], env: {}, cwd: null };
const server = { name: "everything", version: "2026.8.31", protocolVersion: "2025-11-25", capabilities: { tools: {} } };
const tools = [{ name: "echo", inputSchema: { type: "object" } }];

describe("connection store", () => {
  let calls: string[];

  beforeEach(() => {
    resetConnectionStore();
    calls = [];
  });

  function mockServer(overrides: Record<string, () => unknown> = {}) {
    mockIPC((cmd) => {
      calls.push(cmd);
      if (overrides[cmd]) return overrides[cmd]();
      if (cmd === "connect_stdio") return { connectionId: "c1", server };
      if (cmd === "list_tools") return tools;
      return null;
    });
  }

  it("asks for consent before spawning anything", () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    expect(useConnection.getState()).toMatchObject({ status: "awaiting-consent", pendingSpec: spec });
    expect(calls).toEqual([]);
  });

  it("cancelling consent returns to idle without IPC", () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    useConnection.getState().cancelConnect();
    expect(useConnection.getState()).toMatchObject({ status: "idle", pendingSpec: null });
    expect(calls).toEqual([]);
  });

  it("confirming connects, lists tools and records how long listing took", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    const state = useConnection.getState();
    expect(calls).toEqual(["connect_stdio", "list_tools"]);
    expect(state).toMatchObject({ status: "connected", connectionId: "c1", server, tools, pendingSpec: null });
    expect(state.toolsLoadMs).toEqual(expect.any(Number));
  });

  it("does not ask a server without the tools capability to list tools", async () => {
    mockServer({ connect_stdio: () => ({ connectionId: "c1", server: { ...server, capabilities: { prompts: {} } } }) });
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    expect(calls).toEqual(["connect_stdio"]);
    expect(useConnection.getState()).toMatchObject({ status: "connected", connectionId: "c1", tools: [] });
  });

  it("a startup failure lands in the error state with stderr", async () => {
    mockServer({
      connect_stdio: () => {
        throw { kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom"] };
      },
    });
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    const state = useConnection.getState();
    expect(state.status).toBe("error");
    expect(state.error).toMatchObject({ kind: "startupFailed", stderrTail: ["boom"] });
  });

  it("if listing fails after connecting, the orphaned connection is closed", async () => {
    mockServer({
      list_tools: () => {
        throw { kind: "timeout", message: "timed out", stderrTail: [] };
      },
    });
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    expect(calls).toEqual(["connect_stdio", "list_tools", "disconnect"]);
    expect(useConnection.getState().status).toBe("error");
  });

  it("disconnect resets state and tells the backend", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    await useConnection.getState().disconnect();
    expect(calls).toContain("disconnect");
    expect(useConnection.getState()).toMatchObject({ status: "idle", connectionId: null, tools: [] });
  });

  it("a call that finds the server gone drops back to the error state", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    useConnection.getState().handleCallError(new AnvilError("disconnected", "not connected"));
    expect(useConnection.getState()).toMatchObject({ status: "error", connectionId: null });
  });

  it("a newer connect attempt wins and the superseded connection is closed", async () => {
    const spec2 = { ...spec, args: ["-y", "other-server"] };
    const disconnected: unknown[] = [];
    const pending: Array<(value: unknown) => void> = [];
    mockIPC((cmd, args) => {
      calls.push(cmd);
      if (cmd === "connect_stdio") return new Promise((resolve) => pending.push(resolve));
      if (cmd === "list_tools") return tools;
      if (cmd === "disconnect") disconnected.push((args as { connectionId: string }).connectionId);
      return null;
    });

    useConnection.getState().requestConnect(spec);
    const first = useConnection.getState().confirmConnect();
    useConnection.getState().requestConnect(spec2);
    const second = useConnection.getState().confirmConnect();

    pending[0]!({ connectionId: "c1", server });
    await first;
    pending[1]!({ connectionId: "c2", server });
    await second;

    expect(useConnection.getState()).toMatchObject({ status: "connected", connectionId: "c2" });
    expect(disconnected).toEqual(["c1"]);
  });

  it("ordinary tool errors keep the connection", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    useConnection.getState().handleCallError(new AnvilError("protocol", "invalid params"));
    expect(useConnection.getState().status).toBe("connected");
  });
});
