import { useEffect, useId, useState, type ReactNode } from "react";
import { classify } from "../../schema/classify";
import { parseNumberInput } from "../../schema/number";
import { MAX_FORM_DEPTH, resolveRef } from "../../schema/resolve";
import { asObject, type Schema, type SchemaObject } from "../../schema/types";
import { ArrayField, ObjectField, RawJsonField, UnionField } from "./CompositeFields";
import { describedBy, useFieldError, useFormContext, type FieldProps } from "./context";

/** Resolves $ref, then picks the widget for the schema. */
export function Field(props: FieldProps) {
  const { root } = useFormContext();
  const resolved = resolveRef(root, props.schema, props.seen);
  const s = resolved.schema;
  const next: FieldProps = { ...props, schema: s, seen: resolved.seen, label: s.title ?? props.label };

  if (resolved.cyclic || props.depth > MAX_FORM_DEPTH) {
    return <RawJsonField {...next} note="This part of the schema is recursive, so edit it as JSON." />;
  }
  if (resolved.unresolved) {
    return <RawJsonField {...next} note={`Couldn't resolve ${resolved.unresolved}, so edit it as JSON.`} />;
  }

  const c = classify(s);
  switch (c.kind) {
    case "delegate":
      return <Field {...next} schema={withOuterLabels(c.inner, s)} />;
    case "union":
      return <UnionField {...next} branches={c.branches} />;
    case "string":
      return <TextField {...next} />;
    case "number":
    case "integer":
      return <NumberField {...next} integer={c.kind === "integer"} />;
    case "boolean":
      return <BooleanField {...next} />;
    case "enum":
      return <EnumField {...next} options={s.enum ?? []} />;
    case "const":
      return <ConstField {...next} />;
    case "object":
      return <ObjectField {...next} />;
    case "array":
      return <ArrayField {...next} />;
    default:
      return <RawJsonField {...next} note="This field's schema has no form widget, so edit it as JSON." />;
  }
}

function withOuterLabels(inner: Schema, outer: SchemaObject): Schema {
  if (typeof inner !== "object") return inner;
  const merged: SchemaObject = { ...inner };
  if (outer.title !== undefined) merged.title = outer.title;
  if (outer.description !== undefined) merged.description = outer.description;
  if (outer.default !== undefined && outer.default !== null) merged.default = outer.default;
  return merged;
}

function defaultHint(s: SchemaObject): string | undefined {
  return s.default === undefined || s.default === null ? undefined : `Default: ${JSON.stringify(s.default)}`;
}

export function FieldShell(props: {
  id: string;
  label: string;
  required: boolean;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  const { id, label, required, description, error, children } = props;
  return (
    <div className="sf-field" data-invalid={error ? "true" : undefined}>
      <label className="sf-label" htmlFor={id}>
        {label}
        {required && (
          <span className="sf-required" aria-hidden="true">
            {" *"}
          </span>
        )}
      </label>
      {description && (
        <p className="sf-help" id={`${id}-help`}>
          {description}
        </p>
      )}
      {children}
      {error && (
        <p className="sf-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function TextField({ schema, path, label, required, value, onChange }: FieldProps) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = useFieldError(path, touched);
  const s = asObject(schema);
  return (
    <FieldShell id={id} label={label} required={required} description={s.description} error={error}>
      <input
        id={id}
        className="sf-input"
        type="text"
        value={typeof value === "string" ? value : ""}
        placeholder={defaultHint(s)}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(s.description), Boolean(error))}
        onChange={(e) => onChange(e.target.value === "" && !required ? undefined : e.target.value)}
        onBlur={() => setTouched(true)}
      />
    </FieldShell>
  );
}

function NumberField({ schema, path, label, required, value, onChange, integer }: FieldProps & { integer: boolean }) {
  const id = useId();
  const { setLocalError } = useFormContext();
  const [text, setText] = useState(() => (typeof value === "number" ? String(value) : ""));
  const [localError, setLocal] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [syncedValue, setSyncedValue] = useState<unknown>(value);
  const schemaError = useFieldError(path, touched);
  const s = asObject(schema);

  // When the value changes from outside (raw JSON, array reorder), show it, unless it is what the user is typing.
  if (!Object.is(syncedValue, value)) {
    setSyncedValue(value);
    const parsed = parseNumberInput(text, integer);
    if (!(parsed.ok && parsed.value === value)) {
      setText(typeof value === "number" ? String(value) : "");
      setLocal(null);
    }
  }

  useEffect(() => {
    setLocalError(path, localError);
    return () => setLocalError(path, null);
  }, [path, localError, setLocalError]);

  const error = localError ?? schemaError;
  return (
    <FieldShell id={id} label={label} required={required} description={s.description} error={error}>
      <input
        id={id}
        className="sf-input"
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={defaultHint(s)}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(s.description), Boolean(error))}
        onChange={(e) => {
          const nextText = e.target.value;
          setText(nextText);
          const parsed = parseNumberInput(nextText, integer);
          if (parsed.ok) {
            setLocal(null);
            onChange(parsed.value);
          } else {
            setLocal(parsed.error);
          }
        }}
        onBlur={() => setTouched(true)}
      />
    </FieldShell>
  );
}

function BooleanField({ schema, path, label, required, value, onChange }: FieldProps) {
  const id = useId();
  const error = useFieldError(path, true);
  const s = asObject(schema);
  if (required) {
    return (
      <div className="sf-field sf-check" data-invalid={error ? "true" : undefined}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(s.description), Boolean(error))}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className="sf-label" htmlFor={id}>
          {label}
        </label>
        {s.description && (
          <p className="sf-help" id={`${id}-help`}>
            {s.description}
          </p>
        )}
        {error && (
          <p className="sf-error" id={`${id}-error`}>
            {error}
          </p>
        )}
      </div>
    );
  }
  // Optional booleans get three states, so "not set" is never silently sent as false.
  return (
    <FieldShell id={id} label={label} required={false} description={s.description} error={error}>
      <select
        id={id}
        className="sf-input"
        value={value === true ? "true" : value === false ? "false" : ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(s.description), Boolean(error))}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}
      >
        <option value="">{s.default === undefined ? "— not set —" : `— default: ${JSON.stringify(s.default)} —`}</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </FieldShell>
  );
}

function EnumField({ schema, path, label, required, value, onChange, options }: FieldProps & { options: unknown[] }) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = useFieldError(path, touched);
  const s = asObject(schema);
  const index = options.findIndex((o) => Object.is(o, value) || JSON.stringify(o) === JSON.stringify(value));
  const emptyLabel = required
    ? "Choose…"
    : s.default !== undefined
      ? `— default: ${JSON.stringify(s.default)} —`
      : "— not set —";
  return (
    <FieldShell id={id} label={label} required={required} description={s.description} error={error}>
      <select
        id={id}
        className="sf-input"
        value={index === -1 ? "" : String(index)}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(s.description), Boolean(error))}
        onChange={(e) => onChange(e.target.value === "" ? undefined : options[Number(e.target.value)])}
        onBlur={() => setTouched(true)}
      >
        {(!required || index === -1) && <option value="">{emptyLabel}</option>}
        {options.map((option, i) => (
          <option key={i} value={String(i)}>
            {typeof option === "string" ? option : JSON.stringify(option)}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function ConstField({ schema, label }: FieldProps) {
  const s = asObject(schema);
  return (
    <div className="sf-field">
      <span className="sf-label">{label}</span>
      <code className="sf-const">{JSON.stringify(s.const)}</code>
    </div>
  );
}
