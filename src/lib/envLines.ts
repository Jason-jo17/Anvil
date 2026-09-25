export type EnvParse = { ok: true; env: Record<string, string> } | { ok: false; error: string };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses `NAME=value` lines typed by the user. Blank lines and `#` comments are skipped. */
export function parseEnvLines(text: string): EnvParse {
  const env: Record<string, string> = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, "");
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) return { ok: false, error: `Line ${i + 1}: expected NAME=value` };
    const name = line.slice(0, eq).trim();
    if (!NAME.test(name)) return { ok: false, error: `Line ${i + 1}: ${name} is not a valid variable name` };
    env[name] = line.slice(eq + 1);
  }
  return { ok: true, env };
}
