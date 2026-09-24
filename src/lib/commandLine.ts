import type { StdioSpec } from "./types";

/** Splits a command line typed by the user. Quotes group; backslashes are literal (Windows paths). */
export function parseCommandLine(input: string): { command: string; args: string[] } {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let inToken = false;

  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current);
        current = "";
        inToken = false;
      }
      continue;
    }
    current += ch;
    inToken = true;
  }

  if (quote) throw new Error("Unclosed quote in command");
  if (inToken) tokens.push(current);
  const [command, ...args] = tokens;
  if (!command) throw new Error("Enter a command to run");
  return { command, args };
}

/** For display in the consent dialog: exact text, quoted only where needed, backslashes left as typed. */
export function formatCommandLine(spec: StdioSpec): string {
  return [spec.command, ...spec.args]
    .map((part) => (part === "" || /[\s"']/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
    .join(" ");
}
