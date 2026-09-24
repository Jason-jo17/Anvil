import {
  Component,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { pruneUndefined } from "../../schema/prune";
import { asObject, type FieldErrors, type Schema } from "../../schema/types";
import { compileValidator } from "../../schema/validate";
import { FormContext, type FormContextValue } from "./context";
import { Field } from "./Field";
import "./schema-form.css";

export interface SchemaFormProps {
  schema: Schema;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Called with the pruned value, and only when it is valid. */
  onSubmit: (value: unknown) => void;
  submitLabel?: string;
  busy?: boolean;
}

class FormErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function formatErrors(errors: FieldErrors): string {
  return Object.entries(errors)
    .map(([path, messages]) => `${path || "(root)"}: ${messages[0]}`)
    .join("; ");
}

export function SchemaForm({ schema, value, onChange, onSubmit, submitLabel = "Run", busy = false }: SchemaFormProps) {
  const rawId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const validator = useMemo(() => compileValidator(schema), [schema]);
  const [mode, setMode] = useState<"form" | "raw">(() => (validator.ok ? "form" : "raw"));
  const [rawText, setRawText] = useState(() => (validator.ok ? "" : JSON.stringify(value ?? {}, null, 2)));
  const [rawError, setRawError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const setLocalError = useCallback((path: string, message: string | null) => {
    setLocalErrors((prev) => {
      if ((prev[path] ?? null) === message) return prev;
      const next = { ...prev };
      if (message === null) delete next[path];
      else next[path] = message;
      return next;
    });
  }, []);

  const errors = useMemo(() => (validator.ok ? validator.validate(value) : {}), [validator, value]);
  const hasErrors = Object.keys(errors).length > 0 || Object.keys(localErrors).length > 0;
  const root = useMemo(() => asObject(schema), [schema]);
  const context = useMemo<FormContextValue>(
    () => ({ root, errors, showAllErrors: attempted, setLocalError }),
    [root, errors, attempted, setLocalError],
  );

  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  function enterRaw() {
    setRawText(JSON.stringify(value ?? {}, null, 2));
    setRawError(null);
    setMode("raw");
  }

  function parseRaw(): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(rawText) };
    } catch (e) {
      setRawError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false };
    }
  }

  function leaveRaw() {
    const parsed = parseRaw();
    if (!parsed.ok) return;
    onChange(parsed.value);
    setRawError(null);
    setMode("form");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === "raw") {
      const parsed = parseRaw();
      if (!parsed.ok) return;
      onChange(parsed.value);
      const rawErrors = validator.ok ? validator.validate(parsed.value) : {};
      if (Object.keys(rawErrors).length > 0) {
        setRawError(formatErrors(rawErrors));
        return;
      }
      onSubmit(pruneUndefined(parsed.value));
      return;
    }
    if (hasErrors) {
      setAttempted(true);
      setFocusRequest((n) => n + 1);
      return;
    }
    onSubmit(pruneUndefined(value));
  }

  return (
    <form ref={formRef} className="sf" onSubmit={handleSubmit} noValidate>
      {!validator.ok && (
        <p className="sf-warning" role="status">
          This input schema could not be compiled, so validation is off. You can still send raw JSON. (
          {validator.error})
        </p>
      )}
      <div className="sf-toolbar">
        <button
          type="button"
          className="sf-button-quiet"
          aria-pressed={mode === "raw"}
          onClick={() => (mode === "raw" ? leaveRaw() : enterRaw())}
        >
          Raw JSON
        </button>
      </div>

      {mode === "form" ? (
        <FormContext.Provider value={context}>
          <FormErrorBoundary onError={enterRaw}>
            <Field
              schema={schema}
              path=""
              label="Arguments"
              required
              value={value}
              onChange={onChange}
              depth={0}
              seen={new Set()}
            />
          </FormErrorBoundary>
        </FormContext.Provider>
      ) : (
        <div className="sf-field">
          <label className="sf-label" htmlFor={rawId}>
            Arguments (JSON)
          </label>
          <textarea
            id={rawId}
            className="sf-input sf-code"
            rows={12}
            spellCheck={false}
            value={rawText}
            aria-invalid={rawError ? true : undefined}
            aria-describedby={rawError ? `${rawId}-error` : undefined}
            onChange={(e) => {
              setRawText(e.target.value);
              setRawError(null);
            }}
          />
          {rawError && (
            <p className="sf-error" id={`${rawId}-error`} role="alert">
              {rawError}
            </p>
          )}
        </div>
      )}

      <div className="sf-actions">
        <button type="submit" className="sf-button-primary" disabled={busy}>
          {busy ? "Running…" : submitLabel}
        </button>
        {mode === "form" && attempted && hasErrors && (
          <p className="sf-error" role="alert">
            Fix the highlighted fields before running.
          </p>
        )}
      </div>
    </form>
  );
}
