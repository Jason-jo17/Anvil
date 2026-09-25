import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatCommandLine } from "../lib/commandLine";
import { useConnection } from "../state/connection";

export function ConsentDialog() {
  const spec = useConnection((s) => s.pendingSpec);
  const open = useConnection((s) => s.status === "awaiting-consent" && s.pendingSpec !== null);
  const confirm = useConnection((s) => s.confirmConnect);
  const cancel = useConnection((s) => s.cancelConnect);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);

  // Focus the safe choice on open; return focus to where the user was on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!open || !spec) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key !== "Tab") return;
    const first = cancelRef.current;
    const last = runRef.current;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-body"
        onKeyDown={onKeyDown}
      >
        <h2 id="consent-title">Run this command?</h2>
        <div id="consent-body" className="modal-body">
          <p>MCP Anvil will start this program on your computer with your user permissions. Only run servers you trust.</p>
          <pre className="code-block">{formatCommandLine(spec)}</pre>
          {Object.keys(spec.env).length > 0 && (
            <p>
              With environment variables (values hidden): <code>{Object.keys(spec.env).join(", ")}</code>
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="sf-button" onClick={cancel}>
            Cancel
          </button>
          <button ref={runRef} type="button" className="sf-button-primary" onClick={() => void confirm()}>
            Run command
          </button>
        </div>
      </div>
    </div>
  );
}
