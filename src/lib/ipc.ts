import { invoke } from "@tauri-apps/api/core";
import type { IpcErrorPayload, ServerSummary, StdioSpec, ToolSummary } from "./types";

export class AnvilError extends Error {
  readonly kind: string;
  readonly stderrTail: string[];

  constructor(kind: string, message: string, stderrTail: string[] = []) {
    super(message);
    this.name = "AnvilError";
    this.kind = kind;
    this.stderrTail = stderrTail;
  }
}

function isPayload(value: unknown): value is IpcErrorPayload {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}

function toAnvilError(error: unknown): AnvilError {
  if (error instanceof AnvilError) return error;
  if (isPayload(error)) return new AnvilError(error.kind, error.message, error.stderrTail ?? []);
  return new AnvilError("unknown", error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAnvilError(error);
  }
}

export interface ConnectResult {
  connectionId: string;
  server: ServerSummary;
}

export const ipc = {
  connectStdio: (spec: StdioSpec, consented: boolean) => call<ConnectResult>("connect_stdio", { spec, consented }),
  listTools: (connectionId: string) => call<ToolSummary[]>("list_tools", { connectionId }),
  callTool: (connectionId: string, name: string, args: Record<string, unknown>) =>
    call<unknown>("call_tool", { connectionId, name, arguments: args }),
  disconnect: (connectionId: string) => call<null>("disconnect", { connectionId }),
};
