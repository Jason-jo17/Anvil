import { useState } from "react";
import { AnvilError, ipc } from "../lib/ipc";
import type { ToolSummary } from "../lib/types";
import { initialValue } from "../schema/defaults";
import { asObject } from "../schema/types";
import { useConnection } from "../state/connection";
import { SchemaForm } from "./schema-form/SchemaForm";

type RunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; result: unknown; ms: number }
  | { state: "failed"; error: AnvilError };

function isToolError(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { isError?: unknown }).isError === true;
}

/** Shows one tool. Keyed by tool name in App, so switching tools resets the form and the result. */
export function ToolDetail({ tool }: { tool: ToolSummary }) {
  const connectionId = useConnection((s) => s.connectionId);
  const handleCallError = useConnection((s) => s.handleCallError);
  const [args, setArgs] = useState<unknown>(() => initialValue(asObject(tool.inputSchema), tool.inputSchema));
  const [run, setRun] = useState<RunState>({ state: "idle" });

  async function invokeTool(value: unknown) {
    if (!connectionId) return;
    setRun({ state: "running" });
    const started = performance.now();
    try {
      const result = await ipc.callTool(connectionId, tool.name, (value ?? {}) as Record<string, unknown>);
      setRun({ state: "done", result, ms: Math.round(performance.now() - started) });
    } catch (e) {
      const error = e instanceof AnvilError ? e : new AnvilError("unknown", String(e));
      setRun({ state: "failed", error });
      handleCallError(error);
    }
  }

  const toolError = run.state === "done" && isToolError(run.result);
  return (
    <article className="tool-detail" aria-labelledby="tool-title">
      <header className="tool-header">
        <h2 id="tool-title">{tool.title ?? tool.name}</h2>
        {tool.title && <code className="tool-id">{tool.name}</code>}
        {tool.description && <p className="tool-description">{tool.description}</p>}
      </header>

      <SchemaForm
        schema={tool.inputSchema}
        value={args}
        onChange={setArgs}
        onSubmit={(value) => void invokeTool(value)}
        submitLabel="Run tool"
        busy={run.state === "running"}
      />

      <section className="result" aria-labelledby="result-title" aria-live="polite">
        <h3 id="result-title">Result</h3>
        {run.state === "idle" && <p className="sf-help">Run the tool to see its response.</p>}
        {run.state === "running" && <div className="skeleton" role="status" aria-label="Running tool" />}
        {run.state === "done" && (
          <>
            <p className={toolError ? "result-status result-status-error" : "result-status result-status-ok"}>
              {toolError ? "✕ Tool returned an error" : "✓ Success"} · {run.ms} ms
            </p>
            <pre className="code-block">{JSON.stringify(run.result, null, 2)}</pre>
          </>
        )}
        {run.state === "failed" && (
          <p className="sf-error" role="alert">
            {run.error.message}
          </p>
        )}
      </section>
    </article>
  );
}
