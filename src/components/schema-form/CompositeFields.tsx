import { useEffect, useId, useState } from "react";
import { classify } from "../../schema/classify";
import { initialValue } from "../../schema/defaults";
import { childPath } from "../../schema/pointer";
import { resolveRef } from "../../schema/resolve";
import { asObject, type Schema, type SchemaObject } from "../../schema/types";
import { describedBy, useFieldError, useFormContext, type FieldProps } from "./context";
import { Field, FieldShell } from "./Field";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function ObjectField(props: FieldProps) {
  const { schema, path, label, required, value, onChange, depth, seen } = props;
  const s = asObject(schema);
  const error = useFieldError(path, false);
  const entries = Object.entries(s.properties ?? {});
  const requiredKeys = new Set(s.required ?? []);
  const obj = isPlainObject(value) ? value : {};

  if (entries.length === 0) {
    if (depth === 0) {
      return <p className="sf-help">This tool declares no arguments. Use Raw JSON to send some anyway.</p>;
    }
    return <RawJsonField {...props} note="Free-form object, so edit it as JSON." />;
  }

  const fields = entries.map(([key, child]) => (
    <Field
      key={key}
      schema={child}
      path={childPath(path, key)}
      label={key}
      required={requiredKeys.has(key)}
      value={obj[key]}
      depth={depth + 1}
      seen={seen}
      onChange={(next) => {
        const updated = { ...obj };
        if (next === undefined) delete updated[key];
        else updated[key] = next;
        // An optional object with nothing left in it goes back to "not sent", rather than being sent as {}.
        onChange(!required && Object.keys(updated).length === 0 ? undefined : updated);
      }}
    />
  ));

  if (depth === 0) {
    return (
      <div className="sf-root">
        {fields}
        {error && <p className="sf-error">{error}</p>}
      </div>
    );
  }
  return (
    <fieldset className="sf-fieldset">
      <legend className="sf-legend">
        {label}
        {required && <span aria-hidden="true">{" *"}</span>}
      </legend>
      {s.description && <p className="sf-help">{s.description}</p>}
      {fields}
      {error && <p className="sf-error">{error}</p>}
    </fieldset>
  );
}

export function ArrayField(props: FieldProps) {
  const { schema, path, label, required, value, onChange, depth, seen } = props;
  const { root } = useFormContext();
  const s = asObject(schema);
  const error = useFieldError(path, false);
  const items = Array.isArray(value) ? value : [];

  if (s.prefixItems !== undefined || s.items === undefined || typeof s.items === "boolean") {
    return <RawJsonField {...props} note="This list's schema has no form widget, so edit it as JSON." />;
  }
  const itemSchema = s.items;

  return (
    <fieldset className="sf-fieldset">
      <legend className="sf-legend">
        {label}
        {required && <span aria-hidden="true">{" *"}</span>}
      </legend>
      {s.description && <p className="sf-help">{s.description}</p>}
      {items.length === 0 && <p className="sf-help">No items.</p>}
      <ol className="sf-array">
        {items.map((item, i) => (
          <li key={i} className="sf-array-item">
            <Field
              schema={itemSchema}
              path={childPath(path, String(i))}
              label={`Item ${i + 1}`}
              required
              value={item}
              depth={depth + 1}
              seen={seen}
              onChange={(next) => onChange(items.map((x, j) => (j === i ? next : x)))}
            />
            <button
              type="button"
              className="sf-button-quiet"
              aria-label={`Remove ${label} item ${i + 1}`}
              onClick={() => {
                const next = items.filter((_, j) => j !== i);
                onChange(next.length === 0 && !required ? undefined : next);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="sf-button"
        onClick={() => onChange([...items, initialValue(root, itemSchema, seen, true, depth + 1)])}
      >
        Add {label} item
      </button>
      {error && <p className="sf-error">{error}</p>}
    </fieldset>
  );
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function branchLabel(root: SchemaObject, branch: Schema, index: number): string {
  const s = resolveRef(root, branch).schema;
  return s.title ?? (typeof s.type === "string" ? s.type : `Option ${index + 1}`);
}

function pickBranch(root: SchemaObject, branches: Schema[], value: unknown): number {
  if (value === undefined) return 0;
  const type = jsonType(value);
  const index = branches.findIndex((branch) => {
    const kind = classify(resolveRef(root, branch).schema).kind;
    return kind === type || (type === "number" && kind === "integer");
  });
  return index === -1 ? 0 : index;
}

export function UnionField(props: FieldProps & { branches: Schema[] }) {
  const { branches, path, label, required, value, onChange, depth, seen } = props;
  const { root } = useFormContext();
  const id = useId();
  const [active, setActive] = useState(() => pickBranch(root, branches, value));
  const branch = branches[active] ?? branches[0]!;
  return (
    <fieldset className="sf-fieldset">
      <legend className="sf-legend">
        {label}
        {required && <span aria-hidden="true">{" *"}</span>}
      </legend>
      <div className="sf-field">
        <label className="sf-label" htmlFor={id}>
          Variant
        </label>
        <select
          id={id}
          className="sf-input"
          value={String(active)}
          onChange={(e) => {
            const index = Number(e.target.value);
            setActive(index);
            onChange(initialValue(root, branches[index]!, seen, required, depth + 1));
          }}
        >
          {branches.map((b, i) => (
            <option key={i} value={String(i)}>
              {branchLabel(root, b, i)}
            </option>
          ))}
        </select>
      </div>
      <Field
        key={active}
        schema={branch}
        path={path}
        label={branchLabel(root, branch, active)}
        required={required}
        value={value}
        onChange={onChange}
        depth={depth + 1}
        seen={seen}
      />
    </fieldset>
  );
}

export function RawJsonField(props: FieldProps & { note: string }) {
  const { schema, path, label, required, value, onChange, note } = props;
  const id = useId();
  const { setLocalError } = useFormContext();
  const [text, setText] = useState(() => (value === undefined ? "" : JSON.stringify(value, null, 2)));
  const [parseError, setParseError] = useState<string | null>(null);
  const schemaError = useFieldError(path, false);
  const s = asObject(schema);

  useEffect(() => {
    setLocalError(path, parseError);
    return () => setLocalError(path, null);
  }, [path, parseError, setLocalError]);

  const error = parseError ?? schemaError;
  const description = s.description ? `${s.description} ${note}` : note;
  return (
    <FieldShell id={id} label={label} required={required} description={description} error={error}>
      <textarea
        id={id}
        className="sf-input sf-code"
        rows={4}
        spellCheck={false}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, true, Boolean(error))}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "") {
            setParseError(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(next));
            setParseError(null);
          } catch {
            setParseError("Invalid JSON");
          }
        }}
      />
    </FieldShell>
  );
}
