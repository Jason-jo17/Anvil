import type { Schema } from "../schema/types";

export interface StdioSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string | null;
}

export interface ToolSummary {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Schema;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
  icons?: unknown;
}

export interface ServerSummary {
  name: string;
  version: string;
  title?: string;
  protocolVersion: string;
  instructions?: string;
  capabilities: unknown;
}

export interface IpcErrorPayload {
  kind: string;
  message: string;
  stderrTail: string[];
}
