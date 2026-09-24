import type { StdioSpec } from "../lib/types";
import { useConnection } from "../state/connection";

export const SAMPLE_SPEC: StdioSpec = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-everything"],
  env: {},
  cwd: null,
};

export function EmptyState() {
  const requestConnect = useConnection((s) => s.requestConnect);
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 id="empty-title">Connect an MCP server to start</h2>
      <p>Anvil lists the server's tools, builds a form from each tool's input schema, and shows the raw result.</p>
      <button type="button" className="sf-button-primary" onClick={() => requestConnect(SAMPLE_SPEC)}>
        Try server-everything
      </button>
      <p className="sf-help">
        Runs <code>npx -y @modelcontextprotocol/server-everything</code>, the reference test server. Needs Node.js.
      </p>
    </section>
  );
}
