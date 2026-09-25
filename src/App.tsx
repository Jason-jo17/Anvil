import { useEffect, useState } from "react";
import { ConnectPanel } from "./components/ConnectPanel";
import { ConsentDialog } from "./components/ConsentDialog";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { ToolDetail } from "./components/ToolDetail";
import { ToolList } from "./components/ToolList";
import { onConnectionClosed } from "./lib/events";
import { offersTools, useConnection } from "./state/connection";
import "./styles/app.css";

export default function App() {
  const status = useConnection((s) => s.status);
  const server = useConnection((s) => s.server);
  const tools = useConnection((s) => s.tools);
  const toolsLoadMs = useConnection((s) => s.toolsLoadMs);
  const error = useConnection((s) => s.error);
  const disconnect = useConnection((s) => s.disconnect);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onConnectionClosed((event) => useConnection.getState().handleConnectionClosed(event)).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const connected = status === "connected" && server !== null;
  const tool = connected ? (tools.find((t) => t.name === selected) ?? null) : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">MCP Anvil</h1>
        <p className="app-status" role="status" aria-live="polite">
          {connected
            ? `● Connected to ${server.title ?? server.name} ${server.version} · ${tools.length} tools · listed in ${toolsLoadMs} ms`
            : status === "connecting"
              ? "◌ Connecting…"
              : "○ Not connected"}
        </p>
        {connected && (
          <button
            type="button"
            className="sf-button"
            onClick={() => {
              setSelected(null);
              void disconnect();
            }}
          >
            Disconnect
          </button>
        )}
      </header>
      <aside className="app-sidebar">
        {connected ? <ToolList selected={selected} onSelect={setSelected} /> : <ConnectPanel />}
      </aside>
      <main className="app-main">
        {error && <ErrorBanner error={error} />}
        {tool ? (
          <ToolDetail key={tool.name} tool={tool} />
        ) : connected && !offersTools(server) ? (
          <p className="sf-help">This server doesn't offer any tools. Resources and prompts arrive in a later release.</p>
        ) : connected ? (
          <p className="sf-help">Select a tool to inspect and run it.</p>
        ) : (
          <EmptyState />
        )}
      </main>
      <ConsentDialog />
    </div>
  );
}
