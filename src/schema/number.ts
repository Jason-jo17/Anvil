export type NumberParse = { ok: true; value: number | undefined } | { ok: false; error: string };

export function parseNumberInput(text: string, integer: boolean): NumberParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number" };
  if (integer && !Number.isInteger(value)) return { ok: false, error: "Enter a whole number" };
  return { ok: true, value };
}
