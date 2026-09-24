import type { AnvilError } from "../lib/ipc";

function titleFor(kind: string): string {
  switch (kind) {
    case "startupFailed":
      return "The server failed to start";
    case "commandNotFound":
      return "Command not found";
    case "disconnected":
    case "notFound":
      return "The server disconnected";
    case "timeout":
      return "The server didn't respond in time";
    default:
      return "Something went wrong";
  }
}

export function ErrorBanner({ error }: { error: AnvilError }) {
  return (
    <div className="error-banner" role="alert">
      <p className="error-title">✕ {titleFor(error.kind)}</p>
      <p>{error.message}</p>
      {error.stderrTail.length > 0 && (
        <details open>
          <summary>Server stderr (last {error.stderrTail.length} lines)</summary>
          <pre className="code-block">{error.stderrTail.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
