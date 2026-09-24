import { createContext, useContext } from "react";
import type { FieldErrors, Schema, SchemaObject } from "../../schema/types";

export interface FormContextValue {
  root: SchemaObject;
  errors: FieldErrors;
  /** True once the user has tried to submit: every field then shows its error. */
  showAllErrors: boolean;
  /** Fields with input the schema can't see (unparsable number, invalid JSON) register an error here. */
  setLocalError(path: string, message: string | null): void;
}

export interface FieldProps {
  schema: Schema;
  /** JSON Pointer of this value within the arguments object. */
  path: string;
  label: string;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  depth: number;
  seen: ReadonlySet<string>;
}

export const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("Schema form fields must be rendered inside <SchemaForm>");
  return ctx;
}

export function useFieldError(path: string, touched: boolean): string | undefined {
  const { errors, showAllErrors } = useFormContext();
  const message = errors[path]?.[0];
  return message !== undefined && (showAllErrors || touched) ? message : undefined;
}

export function describedBy(id: string, hasHelp: boolean, hasError: boolean): string | undefined {
  const ids = [hasHelp ? `${id}-help` : null, hasError ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}
