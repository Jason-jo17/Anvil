export interface SchemaObject {
  $ref?: string;
  $schema?: string;
  $defs?: Record<string, Schema>;
  definitions?: Record<string, Schema>;
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: Schema;
  /** `Schema[]` is the pre-2020-12 tuple form; see `normalizeLegacyKeywords`. */
  items?: Schema | Schema[];
  additionalItems?: Schema;
  prefixItems?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  format?: string;
  [keyword: string]: unknown;
}

export type Schema = SchemaObject | boolean;

/** Error messages keyed by JSON Pointer to the instance location ("" is the root). */
export type FieldErrors = Record<string, string[]>;

export function asObject(schema: Schema | undefined): SchemaObject {
  return typeof schema === "object" && schema !== null ? schema : {};
}
