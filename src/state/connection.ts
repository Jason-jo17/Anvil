import { create } from "zustand";
import type { ConnectionClosed } from "../lib/events";
import { AnvilError, ipc } from "../lib/ipc";
import type { ServerSummary, StdioSpec, ToolSummary } from "../lib/types";

export type ConnectionStatus = "idle" | "awaiting-consent" | "connecting" | "connected" | "error";

interface ConnectionData {
  status: ConnectionStatus;
  pendingSpec: StdioSpec | null;
  connectionId: string | null;
  server: ServerSummary | null;
  tools: ToolSummary[];
  toolsLoadMs: number | null;
  error: AnvilError | null;
}

interface ConnectionActions {
  requestConnect(spec: StdioSpec): void;
  cancelConnect(): void;
  confirmConnect(): Promise<void>;
  disconnect(): Promise<void>;
  handleCallError(error: AnvilError): void;
  handleConnectionClosed(event: ConnectionClosed): void;
}

const initial: ConnectionData = {
  status: "idle",
  pendingSpec: null,
  connectionId: null,
  server: null,
  tools: [],
  toolsLoadMs: null,
  error: null,
};

export function offersTools(server: ServerSummary): boolean {
  const capabilities = server.capabilities;
  return typeof capabilities === "object" && capabilities !== null && "tools" in capabilities;
}

const toAnvilError = (e: unknown) => (e instanceof AnvilError ? e : new AnvilError("unknown", String(e)));
const closeQuietly = (id: string) => void ipc.disconnect(id).catch(() => undefined);

// Every user action that changes what we should be connected to bumps this. A connect attempt that finishes after
// being superseded closes its own connection instead of overwriting the newer state.
let attempt = 0;

export const useConnection = create<ConnectionData & ConnectionActions>()((set, get) => ({
  ...initial,

  requestConnect: (spec) => {
    attempt++;
    set({ ...initial, status: "awaiting-consent", pendingSpec: spec });
  },

  cancelConnect: () => {
    attempt++;
    set({ status: "idle", pendingSpec: null });
  },

  confirmConnect: async () => {
    const { pendingSpec, status } = get();
    if (!pendingSpec || status !== "awaiting-consent") return;
    const mine = ++attempt;
    set({ status: "connecting", error: null });

    let connectionId: string | null = null;
    try {
      const result = await ipc.connectStdio(pendingSpec, true);
      connectionId = result.connectionId;
      const started = performance.now();
      // A server that doesn't declare the tools capability would reject tools/list; it has no tools to show.
      const tools = offersTools(result.server) ? await ipc.listTools(connectionId) : [];
      const toolsLoadMs = Math.round(performance.now() - started);
      if (mine !== attempt) {
        closeQuietly(connectionId);
        return;
      }
      set({ status: "connected", connectionId, server: result.server, tools, toolsLoadMs, pendingSpec: null });
    } catch (e) {
      if (connectionId) closeQuietly(connectionId);
      if (mine === attempt) set({ ...initial, status: "error", error: toAnvilError(e) });
    }
  },

  disconnect: async () => {
    attempt++;
    const id = get().connectionId;
    set({ ...initial });
    if (id) await ipc.disconnect(id).catch(() => undefined);
  },

  handleCallError: (error) => {
    if (error.kind === "disconnected" || error.kind === "notFound") set({ ...initial, status: "error", error });
  },

  handleConnectionClosed: ({ connectionId, stderrTail }) => {
    if (connectionId !== get().connectionId) return;
    attempt++;
    const error = new AnvilError("disconnected", "The server exited unexpectedly.", stderrTail);
    set({ ...initial, status: "error", error });
  },
}));

export function resetConnectionStore() {
  useConnection.setState(initial);
}
