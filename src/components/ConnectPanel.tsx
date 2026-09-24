import { useId, useState, type FormEvent } from "react";
import { parseCommandLine } from "../lib/commandLine";
import { useConnection } from "../state/connection";

export function ConnectPanel() {
  const requestConnect = useConnection((s) => s.requestConnect);
  const connecting = useConnection((s) => s.status === "connecting");
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { command, args } = parseCommandLine(line);
      setError(null);
      requestConnect({ command, args, env: {}, cwd: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className="connect" onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">
        Connect a server
      </h2>
      <div className="sf-field">
        <label htmlFor={id} className="sf-label">
          Command (stdio)
        </label>
        <input
          id={id}
          className="sf-input sf-code"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder="npx -y @modelcontextprotocol/server-everything"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
        />
        <p id={`${id}-help`} className="sf-help">
          Runs locally over stdio. You confirm before anything starts.
        </p>
        {error && (
          <p id={`${id}-error`} className="sf-error">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="sf-button-primary" disabled={connecting}>
        {connecting ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
