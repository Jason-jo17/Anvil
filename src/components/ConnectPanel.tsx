import { useId, useState, type FormEvent } from "react";
import { parseCommandLine } from "../lib/commandLine";
import { parseEnvLines } from "../lib/envLines";
import { useConnection } from "../state/connection";

export function ConnectPanel() {
  const requestConnect = useConnection((s) => s.requestConnect);
  const connecting = useConnection((s) => s.status === "connecting");
  const [line, setLine] = useState("");
  const [envText, setEnvText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  const id = useId();
  const envId = `${id}-env`;

  function submit(e: FormEvent) {
    e.preventDefault();
    const env = parseEnvLines(envText);
    setEnvError(env.ok ? null : env.error);
    try {
      const { command, args } = parseCommandLine(line);
      setError(null);
      if (env.ok) requestConnect({ command, args, env: env.env, cwd: null });
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
      <div className="sf-field">
        <label htmlFor={envId} className="sf-label">
          Environment variables (optional)
        </label>
        <textarea
          id={envId}
          className="sf-input sf-code"
          rows={3}
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder="API_TOKEN=…"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={envError ? true : undefined}
          aria-describedby={envError ? `${envId}-error` : `${envId}-help`}
        />
        <p id={`${envId}-help`} className="sf-help">
          One NAME=value per line. Passed only to this server; never saved or logged.
        </p>
        {envError && (
          <p id={`${envId}-error`} className="sf-error">
            {envError}
          </p>
        )}
      </div>
      <button type="submit" className="sf-button-primary" disabled={connecting}>
        {connecting ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
