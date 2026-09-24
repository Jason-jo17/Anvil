import { create } from "zustand";
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

const toAnvilError = (e: unknown) => (e instanceof AnvilError ? e : new AnvilError("unknown", String(e)));
const closeQuietly = (id: string) => void ipc.disconnect(id).catch(() => undefined);

export const useConnection = create<ConnectionData & ConnectionActions>()((set, get) => ({
  ...initial,

  requestConnect: (spec) => set({ ...initial, status: "awaiting-consent", pendingSpec: spec }),

  cancelConnect: () => set({ status: "idle", pendingSpec: null }),

  confirmConnect: async () => {
    const { pendingSpec, status } = get();
    if (!pendingSpec || status !== "awaiting-consent") return;
    set({ status: "connecting", error: null });

    let connectionId: string | null = null;
    try {
      const result = await ipc.connectStdio(pendingSpec, true);
      connectionId = result.connectionId;
      const started = performance.now();
      const tools = await ipc.listTools(connectionId);
      const toolsLoadMs = Math.round(performance.now() - started);
      if (get().status !== "connecting") {
        closeQuietly(connectionId); // The user moved on while we were connecting.
        return;
      }
      set({ status: "connected", connectionId, server: result.server, tools, toolsLoadMs, pendingSpec: null });
    } catch (e) {
      if (connectionId) closeQuietly(connectionId);
      set({ ...initial, status: "error", error: toAnvilError(e) });
    }
  },

  disconnect: async () => {
    const id = get().connectionId;
    set({ ...initial });
    if (id) await ipc.disconnect(id).catch(() => undefined);
  },

  handleCallError: (error) => {
    if (error.kind === "disconnected" || error.kind === "notFound") set({ ...initial, status: "error", error });
  },
}));

export function resetConnectionStore() {
  useConnection.setState(initial);
}
