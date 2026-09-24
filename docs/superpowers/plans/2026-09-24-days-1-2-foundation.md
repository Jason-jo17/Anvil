# Days 1–2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Tauri desktop app that, with the user's consent, spawns a stdio MCP server, lists its tools in under 2 s, renders a validated form from each tool's JSON Schema, invokes the tool, shows the raw result, and disconnects cleanly.

**Architecture:** All protocol and process logic lives in `crates/anvil-core` (Rust, official `rmcp` 3.4 client). `src-tauri` is a thin shell: a connection `Registry` plus `#[tauri::command]` one-liners. The React frontend talks to it through a typed `ipc` module and a Zustand store. JSON-Schema forms are a custom renderer over Ajv 2020-12 (ADR-0002).

**Tech Stack:** Rust 2024 (MSRV 1.88), Tauri 2.11.6, rmcp 3.4.1, tokio, which, thiserror; React 19.3, TypeScript 5.9, Vite 8, Vitest 5, Zustand 5, Ajv 8 (2020-12) + ajv-formats; pnpm 10, Node 24.

**Spec:** `docs/SPEC.md` (milestone "Days 1–2"; acceptance criteria 1 and 4).

## Global Constraints

- Rust edition 2024; `rust-version = "1.88"` (the floor set by rmcp 3.4.1); workspace lint `unsafe_code = "forbid"`.
- `tauri` 2.11.6, `tauri-build` 2.6.x, `@tauri-apps/api` ~2.11, `@tauri-apps/cli` ~2.11.5.
- `rmcp` 3.4.1 with `default-features = false`; features are enabled per crate.
- TypeScript `~5.9.3`, not 7.x. Vite `^8`, Vitest `^5`, React `^19.3`, Zustand `^5`, Ajv `^8.20` via `ajv/dist/2020`.
- No telemetry. No network listeners. The Vite dev server binds `127.0.0.1`, never `0.0.0.0`.
- Never spawn a local command without explicit user consent. Spawned servers receive only an allowlisted environment plus what the user set.
- DTOs crossing the IPC boundary mirror MCP wire JSON (camelCase).
- UI colors, spacing, type, radius and motion come only from `src/styles/tokens.css`. WCAG AA contrast, visible focus rings, full keyboard operation, `prefers-reduced-motion` honored. State is never encoded by color alone.
- Tool names, descriptions and results are untrusted server data. Render them as text; never use `dangerouslySetInnerHTML`.
- `cargo clippy --workspace --all-targets -- -D warnings` and `cargo fmt --all -- --check` must pass after every task.
- Conventional commits. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Windows `.cmd` shims.** A user on Windows types `npx -y @modelcontextprotocol/server-everything`; `npx` is `npx.cmd`, which `Command::new("npx")` cannot spawn. Expected: it resolves and starts. Pinned by `npx_resolves_to_its_cmd_shim` in Task 4.
2. **Server dies at startup or mid-session.** Expected: a clear error that carries the server's stderr, and the UI returns to "not connected". It must never hang. Pinned by the startup, crash and disconnect tests in Task 4 and the disconnected-call test in Task 9.
3. **Awkward schemas:** self-referential `$ref`, `$schema: draft-07` (zod-to-json-schema output), and schemas Ajv cannot compile. Expected: the form still renders, falling back to raw JSON where needed. Pinned by tests in Tasks 7 and 8.
4. **Blank optional fields and numeric text.** Expected: untouched optional fields are omitted, not sent as `""`, `0` or `{}`. `"abc"` in a number field blocks submit with an inline message. Pinned by tests in Tasks 7 and 8.
5. **Closing the app with live servers.** Expected: every spawned server process is stopped. Pinned by `close_all_closes_every_connection` in Task 5 and `disconnect_terminates_the_child_process` in Task 4.

## Prerequisites (one-time, before Task 1)

- Rust via rustup: `winget install Rustlang.Rustup` on Windows, or see https://rustup.rs. Then `rustup default stable` and confirm `cargo --version` reports 1.88 or newer.
- Windows: Visual Studio Build Tools with the "Desktop development with C++" workload (MSVC linker). WebView2 ships with Windows 11.
- Linux: `sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
- Node 24 and pnpm 10 (already present on the dev machine).

## Out of scope for this plan

These are deferred to later milestones in the spec: HTTP transports, OAuth, MRTR, resources/prompts explorer, outputSchema/icon display, response visualizers, SQLite, command palette, env-var editor UI, Storybook, Playwright e2e, the coverage gate, OS-level process sandboxing (ADR-0004), and `anvil-cli`.

## File Map

```
Cargo.toml                         workspace (Task 2; src-tauri member added in Task 5)
rust-toolchain.toml                stable + clippy + rustfmt (Task 2)
package.json, pnpm-lock.yaml       frontend + tauri cli + server-everything fixture (Task 1)
tsconfig.json, vite.config.ts, vitest.config.ts, eslint.config.js, index.html   (Task 1)
.gitattributes, LICENSE-MIT, LICENSE-APACHE                                      (Task 1)
docs/ADRs/0001..0004-*.md          decisions (Task 2)
crates/anvil-core/
  src/lib.rs                       module wiring
  src/error.rs                     CoreError + stable kind() strings           (Task 2)
  src/model.rs                     ToolSummary, ServerSummary (wire mirrors)   (Task 2)
  src/session.rs                   McpSession over any rmcp transport          (Task 3)
  src/fixture.rs                   in-process MCP test server (feature-gated)  (Task 3)
  src/stdio.rs                     spawn + consent + env + stderr capture      (Task 4)
  tests/stdio_everything.rs        integration vs server-everything            (Task 4)
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, app-icon.svg, icons/
  src/main.rs, src/lib.rs          app entry + exit cleanup                    (Task 5)
  src/registry.rs                  connection registry + IpcError              (Task 5)
  src/commands.rs                  thin #[tauri::command] wrappers             (Task 5)
src/
  main.tsx, App.tsx                                                            (Tasks 1, 9)
  styles/tokens.css, styles/global.css, styles/app.css                         (Tasks 1, 9)
  test/setup.ts                                                                (Task 1)
  lib/types.ts, lib/ipc.ts, lib/commandLine.ts                                 (Task 6)
  state/connection.ts                                                          (Task 6)
  schema/types.ts, pointer.ts, resolve.ts, classify.ts, defaults.ts, prune.ts, validate.ts, number.ts   (Task 7)
  components/schema-form/context.ts, Field.tsx, CompositeFields.tsx, SchemaForm.tsx, schema-form.css    (Task 8)
  components/ConnectPanel.tsx, ConsentDialog.tsx, EmptyState.tsx, ErrorBanner.tsx, ToolList.tsx, ToolDetail.tsx   (Task 9)
.github/workflows/ci.yml, README.md                                            (Task 10)
```

---

### Task 1: Frontend toolchain scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`, `.gitattributes`, `LICENSE-MIT`, `LICENSE-APACHE`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: scripts `pnpm test | typecheck | lint | build | dev | tauri`; CSS custom properties in `tokens.css` (`--color-*`, `--space-*`, `--radius-*`, `--font-*`, `--text-*`, `--duration-*`, `--ease-out`, `--focus-ring`) used by every later UI task; `node_modules/@modelcontextprotocol/server-everything/dist/index.js` used by Task 4's integration tests; `dist/` used by Task 5's `tauri::generate_context!()`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "mcp-anvil",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "license": "MIT OR Apache-2.0",
  "packageManager": "pnpm@10.28.2",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add react@^19.3 react-dom@^19.3 zustand@^5 ajv@^8.20 ajv-formats@^3 @tauri-apps/api@~2.11
```

```bash
pnpm add -D typescript@~5.9.3 vite@^8 @vitejs/plugin-react@^6 vitest@^5 jsdom@^30 @testing-library/react@^16 @testing-library/user-event@^14 @testing-library/jest-dom@^7 @types/react@^19.3 @types/react-dom@^19.3 @types/node@^24 eslint@^10 @eslint/js typescript-eslint@^8 eslint-plugin-react-hooks@^7 globals @tauri-apps/cli@~2.11.5 @modelcontextprotocol/server-everything@2026.8.31
```

Expected: `pnpm-lock.yaml` is created and `node_modules/@modelcontextprotocol/server-everything/dist/index.js` exists.

- [ ] **Step 3: Write the config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri sets TAURI_DEV_HOST only for mobile dev. Desktop dev stays on loopback: never bind 0.0.0.0.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**"] },
  },
  build: {
    target: "es2022",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
```

`eslint.config.js`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "target", "src-tauri", "crates", "node_modules", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
);
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MCP Anvil</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import { randomFillSync } from "node:crypto";
import { afterEach, beforeAll } from "vitest";

beforeAll(() => {
  // Tauri's IPC mocks need WebCrypto; some jsdom builds don't expose it on window.
  if (!window.crypto?.getRandomValues) {
    Object.defineProperty(window, "crypto", {
      value: { getRandomValues: (buffer: Uint8Array) => randomFillSync(buffer) },
    });
  }
});

afterEach(() => {
  cleanup();
  clearMocks();
});
```

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.ico binary
*.icns binary
```

- [ ] **Step 4: Write the failing test**

`src/App.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the product name as the top-level heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "MCP Anvil" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL, because `./App` cannot be resolved.

- [ ] **Step 6: Write the app entry, tokens and base styles**

`src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">MCP Anvil</h1>
      </header>
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles/tokens.css`:
```css
/* The single source of design tokens. Components use these variables and nothing else. */
:root {
  color-scheme: light;
  --color-bg: #f7f7f5;
  --color-surface: #ffffff;
  --color-surface-sunken: #efefec;
  --color-border: #d9d9d4;
  --color-text: #1b1b19;
  --color-text-muted: #5c5c57;
  --color-accent: #b4410e;
  --color-accent-text: #ffffff;
  --color-danger: #b3261e;
  --color-danger-surface: #fdecea;
  --color-success: #1e7a3c;
  --color-focus: #1f5fd6;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: 4px;
  --radius-md: 8px;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --font-mono: ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
  --text-sm: 0.8125rem;
  --text-md: 0.9375rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;

  --duration-fast: 150ms;
  --duration-base: 200ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);

  --focus-ring: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-focus);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --color-bg: #141413;
    --color-surface: #1d1d1b;
    --color-surface-sunken: #111110;
    --color-border: #34342f;
    --color-text: #ecebe6;
    --color-text-muted: #a3a29a;
    --color-accent: #f0773a;
    --color-accent-text: #1b0d05;
    --color-danger: #ff8a80;
    --color-danger-surface: #3a1614;
    --color-success: #6fd08c;
    --color-focus: #7aa7ff;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --color-bg: #141413;
  --color-surface: #1d1d1b;
  --color-surface-sunken: #111110;
  --color-border: #34342f;
  --color-text: #ecebe6;
  --color-text-muted: #a3a29a;
  --color-accent: #f0773a;
  --color-accent-text: #1b0d05;
  --color-danger: #ff8a80;
  --color-danger-surface: #3a1614;
  --color-success: #6fd08c;
  --color-focus: #7aa7ff;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-base: 0ms;
  }
}
```

`src/styles/global.css`:
```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: 1.5;
}

h1,
h2,
h3,
p {
  margin: 0;
}

code,
pre,
textarea.sf-code {
  font-family: var(--font-mono);
}

:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-sm);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
```

- [ ] **Step 7: Run the checks and verify they pass**

Run: `pnpm test` then `pnpm typecheck` then `pnpm lint` then `pnpm build`
Expected: 1 test passes, no type or lint errors, `dist/index.html` exists.

If `@testing-library/jest-dom/vitest` fails to resolve, check `node_modules/@testing-library/jest-dom/package.json` `exports` for the Vitest entry and use that path.

- [ ] **Step 8: Add licenses**

`LICENSE-MIT`:
```
MIT License

Copyright (c) 2026 MCP Anvil contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

```bash
curl -fsSL -o LICENSE-APACHE https://www.apache.org/licenses/LICENSE-2.0.txt
```

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts eslint.config.js index.html .gitattributes LICENSE-MIT LICENSE-APACHE src
git commit -m "chore: scaffold React + Vite + Vitest frontend with design tokens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cargo workspace, core wire types, ADRs

**Files:**
- Create: `Cargo.toml`, `rust-toolchain.toml`
- Create: `crates/anvil-core/Cargo.toml`, `crates/anvil-core/src/lib.rs`, `crates/anvil-core/src/error.rs`, `crates/anvil-core/src/model.rs`
- Create: `docs/ADRs/0001-rmcp-as-mcp-client.md`, `docs/ADRs/0002-custom-json-schema-forms.md`, `docs/ADRs/0003-stack-version-updates.md`, `docs/ADRs/0004-stdio-process-safety.md`
- Test: unit tests inside `error.rs` and `model.rs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `anvil_core::CoreError` with variants `CommandNotFound(String)`, `ConsentMismatch`, `StartupFailed { reason: String, stderr_tail: Vec<String> }`, `Timeout { what: &'static str, after: Duration }`, `Disconnected`, `Protocol(String)`, `InvalidData(String)`, `Io(std::io::Error)`; methods `kind(&self) -> &'static str` and `stderr_tail(&self) -> &[String]`.
  - `anvil_core::ToolSummary { name, title: Option<String>, description: Option<String>, input_schema: Value, output_schema: Option<Value>, annotations: Option<Value>, icons: Option<Value> }` (serde camelCase) with `ToolSummary::from_wire(Value) -> Result<Self, CoreError>`.
  - `anvil_core::ServerSummary { name, version, title: Option<String>, protocol_version: String, instructions: Option<String>, capabilities: Value }` (Serialize camelCase) with `ServerSummary::from_initialize_result(Value) -> Result<Self, CoreError>`.

- [ ] **Step 1: Write the workspace files**

`Cargo.toml`:
```toml
[workspace]
resolver = "3"
members = ["crates/anvil-core"]

[workspace.package]
edition = "2024"
rust-version = "1.88"
license = "MIT OR Apache-2.0"

[workspace.dependencies]
rmcp = { version = "3.4.1", default-features = false }
schemars = "1.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tokio = "1.53"
which = "8"

[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }
```

`rust-toolchain.toml`:
```toml
[toolchain]
channel = "stable"
components = ["clippy", "rustfmt"]
```

`crates/anvil-core/Cargo.toml`:
```toml
[package]
name = "anvil-core"
version = "0.1.0"
description = "Protocol, transport and domain logic for MCP Anvil"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
thiserror.workspace = true

[lints]
workspace = true
```

`crates/anvil-core/src/lib.rs`:
```rust
//! Protocol, transport and domain logic for MCP Anvil. Nothing in this crate knows about Tauri or the UI.

pub mod error;
pub mod model;

pub use error::CoreError;
pub use model::{ServerSummary, ToolSummary};
```

- [ ] **Step 2: Write the failing tests**

`crates/anvil-core/src/error.rs`, with tests only for now:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn kinds_are_stable_identifiers_for_the_frontend() {
        let cases = [
            (CoreError::CommandNotFound("x".into()), "commandNotFound"),
            (CoreError::ConsentMismatch, "consentMismatch"),
            (CoreError::StartupFailed { reason: "r".into(), stderr_tail: vec![] }, "startupFailed"),
            (CoreError::Timeout { what: "tools/list", after: Duration::from_secs(1) }, "timeout"),
            (CoreError::Disconnected, "disconnected"),
            (CoreError::Protocol("p".into()), "protocol"),
            (CoreError::InvalidData("d".into()), "invalidData"),
            (CoreError::Io(std::io::Error::other("io")), "io"),
        ];
        for (error, kind) in cases {
            assert_eq!(error.kind(), kind, "{error}");
        }
    }

    #[test]
    fn startup_failures_expose_their_stderr_tail() {
        let error = CoreError::StartupFailed { reason: "exited".into(), stderr_tail: vec!["boom".into()] };
        assert_eq!(error.stderr_tail(), ["boom".to_string()]);
        assert_eq!(error.to_string(), "the server failed to start: exited");
        assert!(CoreError::Disconnected.stderr_tail().is_empty());
    }
}
```

`crates/anvil-core/src/model.rs`, with tests only for now:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_a_full_wire_tool_and_ignores_unknown_fields() {
        let tool = ToolSummary::from_wire(json!({
            "name": "create_ticket",
            "title": "Create ticket",
            "description": "Opens a ticket",
            "inputSchema": { "type": "object", "properties": { "title": { "type": "string" } } },
            "outputSchema": { "type": "object" },
            "annotations": { "readOnlyHint": false },
            "icons": [{ "src": "https://example.com/i.png" }],
            "execution": { "taskSupport": "optional" },
            "_meta": { "x": 1 }
        }))
        .unwrap();
        assert_eq!(tool.name, "create_ticket");
        assert_eq!(tool.title.as_deref(), Some("Create ticket"));
        assert_eq!(tool.input_schema["properties"]["title"]["type"], "string");
        assert!(tool.output_schema.is_some());
    }

    #[test]
    fn a_tool_without_input_schema_gets_an_empty_object_schema() {
        let tool = ToolSummary::from_wire(json!({ "name": "ping" })).unwrap();
        assert_eq!(tool.input_schema, json!({ "type": "object" }));
    }

    #[test]
    fn a_tool_without_a_name_is_invalid_data() {
        let error = ToolSummary::from_wire(json!({ "description": "nameless" })).unwrap_err();
        assert!(matches!(error, CoreError::InvalidData(_)), "{error:?}");
    }

    #[test]
    fn serializes_tools_in_wire_camel_case_without_empty_optionals() {
        let tool = ToolSummary::from_wire(json!({ "name": "ping" })).unwrap();
        let wire = serde_json::to_value(&tool).unwrap();
        assert_eq!(wire, json!({ "name": "ping", "inputSchema": { "type": "object" } }));
    }

    #[test]
    fn parses_server_summary_from_an_initialize_result() {
        let server = ServerSummary::from_initialize_result(json!({
            "protocolVersion": "2025-11-25",
            "capabilities": { "tools": { "listChanged": true } },
            "serverInfo": { "name": "everything", "version": "2026.8.31", "title": "Everything" },
            "instructions": "Test server"
        }))
        .unwrap();
        assert_eq!(server.name, "everything");
        assert_eq!(server.title.as_deref(), Some("Everything"));
        assert_eq!(server.protocol_version, "2025-11-25");
        let wire = serde_json::to_value(&server).unwrap();
        assert_eq!(wire["protocolVersion"], "2025-11-25");
    }

    #[test]
    fn an_initialize_result_without_server_info_is_invalid_data() {
        let error = ServerSummary::from_initialize_result(json!({ "protocolVersion": "x" })).unwrap_err();
        assert!(matches!(error, CoreError::InvalidData(_)), "{error:?}");
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cargo test -p anvil-core`
Expected: FAIL to compile, because `CoreError`, `ToolSummary` and `ServerSummary` are not defined.

- [ ] **Step 4: Implement `error.rs` and `model.rs`**

Prepend to `crates/anvil-core/src/error.rs`, above the tests:
```rust
use std::time::Duration;

/// Every failure anvil-core can report. `kind()` is the stable identifier the frontend switches on.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("command not found: {0}")]
    CommandNotFound(String),
    #[error("consent was granted for a different command than the one being spawned")]
    ConsentMismatch,
    #[error("the server failed to start: {reason}")]
    StartupFailed { reason: String, stderr_tail: Vec<String> },
    #[error("timed out after {after:?} waiting for {what}")]
    Timeout { what: &'static str, after: Duration },
    #[error("not connected: the server closed the connection")]
    Disconnected,
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("unexpected data from the server: {0}")]
    InvalidData(String),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
}

impl CoreError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::CommandNotFound(_) => "commandNotFound",
            Self::ConsentMismatch => "consentMismatch",
            Self::StartupFailed { .. } => "startupFailed",
            Self::Timeout { .. } => "timeout",
            Self::Disconnected => "disconnected",
            Self::Protocol(_) => "protocol",
            Self::InvalidData(_) => "invalidData",
            Self::Io(_) => "io",
        }
    }

    pub fn stderr_tail(&self) -> &[String] {
        match self {
            Self::StartupFailed { stderr_tail, .. } => stderr_tail,
            _ => &[],
        }
    }
}
```

Prepend to `crates/anvil-core/src/model.rs`, above the tests:
```rust
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::CoreError;

/// A tool as advertised by `tools/list`, mirroring the MCP wire shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSummary {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "empty_object_schema")]
    pub input_schema: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Value>,
}

fn empty_object_schema() -> Value {
    json!({ "type": "object" })
}

impl ToolSummary {
    pub fn from_wire(value: Value) -> Result<Self, CoreError> {
        serde_json::from_value(value).map_err(|e| CoreError::InvalidData(format!("tool: {e}")))
    }
}

/// Who we are talking to, taken from the `initialize` result.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSummary {
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub protocol_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    pub capabilities: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireInitializeResult {
    protocol_version: String,
    #[serde(default)]
    capabilities: Value,
    server_info: WireImplementation,
    #[serde(default)]
    instructions: Option<String>,
}

#[derive(Deserialize)]
struct WireImplementation {
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    title: Option<String>,
}

impl ServerSummary {
    pub fn from_initialize_result(value: Value) -> Result<Self, CoreError> {
        let wire: WireInitializeResult = serde_json::from_value(value)
            .map_err(|e| CoreError::InvalidData(format!("initialize result: {e}")))?;
        Ok(Self {
            name: wire.server_info.name,
            version: wire.server_info.version,
            title: wire.server_info.title,
            protocol_version: wire.protocol_version,
            instructions: wire.instructions,
            capabilities: wire.capabilities,
        })
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cargo test -p anvil-core` then `cargo clippy --workspace --all-targets -- -D warnings` then `cargo fmt --all -- --check`
Expected: 8 tests pass; no warnings; formatting clean. If fmt reports a diff, run `cargo fmt --all` and re-run.

- [ ] **Step 6: Write the ADRs**

`docs/ADRs/0001-rmcp-as-mcp-client.md`:
```markdown
# ADR-0001: Official `rmcp` 3.4 as the MCP client

Status: Accepted, 2026-09-24

## Context
The spec prefers the official Rust SDK and allows `rust-mcp-sdk` 2.x only if the official crate lags on a needed feature.

## Decision
Use `rmcp` 3.4.1. Its README states support for the 2026-07-28 spec (server/discover lifecycle, stateless Streamable HTTP,
standard `Mcp-*` headers, multi-round-trip requests, caching) with compatibility back to 2025-11-25. It ships every
transport and auth feature v1 needs: `transport-child-process`, `transport-streamable-http-client-reqwest`,
`client-side-sse`, `auth`, `elicitation`.

## Consequences
- Wire DTOs crossing into the UI are our own `ToolSummary`/`ServerSummary`, converted via serde from rmcp's types, so
  rmcp renames do not ripple into the frontend.
- MSRV is 1.88 (rmcp's floor).
```

`docs/ADRs/0002-custom-json-schema-forms.md`:
```markdown
# ADR-0002: Custom JSON-Schema form renderer on Ajv 2020-12

Status: Accepted, 2026-09-24

## Context
The spec allows RJSF or a custom renderer. Forms must render `$ref`, `anyOf`/`oneOf`, enums, nested objects and arrays,
validate with inline errors, round-trip through a raw-JSON view, and reuse the design tokens and a11y rules. The same
renderer will render MRTR elicitation forms later.

## Decision
Build a small custom renderer (`src/components/schema-form`) over Ajv 2020-12 (`ajv/dist/2020`) + `ajv-formats`.

## Consequences
- Full control of markup, ARIA wiring, tokens and error placement; no theme layer to fight.
- We own edge cases RJSF would handle. Unsupported constructs (`allOf`, tuples, multi-type unions, free-form
  objects, recursion) fall back to a per-field raw-JSON editor rather than failing.
- `$schema` is stripped before compiling so draft-07 schemas (zod-to-json-schema output) still validate.
```

`docs/ADRs/0003-stack-version-updates.md`:
```markdown
# ADR-0003: Stack version updates at build time

Status: Accepted, 2026-09-24

The spec's pins are marked "VERIFY at build". Registry state on 2026-09-24 and what we use:

| Spec pin | Latest | Using | Why |
|---|---|---|---|
| tauri 2.11.5 | 2.11.6 | 2.11.6 | Patch release, same minor |
| wry 0.56.x | 0.57.0 | whatever tauri 2.11.6 pulls | Transitive; never pinned directly |
| rmcp (unpinned) | 3.4.1 | 3.4.1 | See ADR-0001 |
| TypeScript 5.x | 7.0.2 | ~5.9.3 | 7.x is the native-compiler rewrite; stay on the spec's 5.x until typescript-eslint and tooling are proven on 7 |
| Vite 6 | 8.3.1 | ^8 | `@vitejs/plugin-react` 6 requires Vite 8; Vitest 5 supports 6–8 |
```

`docs/ADRs/0004-stdio-process-safety.md`:
```markdown
# ADR-0004: Safety for spawned stdio servers (v1 baseline)

Status: Accepted, 2026-09-24

## Context
The spec requires "sandboxed stdio child processes; explicit user consent before spawning a local command". Real
OS sandboxing (AppContainer/Job Objects on Windows, sandbox-exec on macOS, namespaces/landlock on Linux) is a
multi-day, per-OS effort.

## Decision (Days 1–2)
1. Consent: `connect_stdio` requires a `SpawnConsent` built for exactly the spec being spawned; the Tauri command
   refuses unless the UI's consent dialog sent `consented: true`. The dialog shows the exact command line.
2. Environment: children get an allowlist of the parent environment (mirroring the MCP SDKs' default environment:
   PATH, HOME/USERPROFILE, TEMP, SYSTEMROOT, and so on) plus variables the user set explicitly. API keys and cloud
   credentials in the parent environment are not inherited.
3. Lifetime: sessions close on disconnect and on app exit; rmcp's child-process transport kills on drop.
4. Resource caps: server stderr is captured into a bounded ring buffer (200 lines × 2 KiB, 64 KiB per read).

## Deferred
OS-level sandboxing, and process-tree termination for launchers that spawn grandchildren (Windows Job Objects), is
tracked for the Day 14 hardening pass.
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock rust-toolchain.toml crates docs/ADRs
git commit -m "feat(core): add workspace, CoreError and MCP wire summaries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `McpSession` over any rmcp transport

**Files:**
- Create: `crates/anvil-core/src/session.rs`, `crates/anvil-core/src/fixture.rs`
- Modify: `crates/anvil-core/Cargo.toml`, `crates/anvil-core/src/lib.rs`
- Test: unit tests inside `session.rs`

**Interfaces:**
- Consumes: `CoreError`, `ToolSummary::from_wire`, `ServerSummary::from_initialize_result` (Task 2).
- Produces:
  - `anvil_core::SessionOptions { connect_timeout: Duration, request_timeout: Duration }`, `Default` = 30 s / 60 s, `Copy`.
  - `anvil_core::McpSession` with
    - `async fn connect_with<T, E, A>(transport: T, options: SessionOptions) -> Result<McpSession, CoreError>` where `T: rmcp::transport::IntoTransport<rmcp::RoleClient, E, A>, E: std::error::Error + Send + Sync + 'static`
    - `fn server(&self) -> &ServerSummary`
    - `async fn list_tools(&self) -> Result<Vec<ToolSummary>, CoreError>`
    - `async fn call_tool(&self, name: &str, arguments: serde_json::Map<String, Value>) -> Result<Value, CoreError>`, which returns the wire `CallToolResult` JSON
    - `async fn close(&self)`, which is idempotent; later requests return `CoreError::Disconnected`
  - `anvil_core::fixture::spawn_fixture() -> (tokio::io::DuplexStream, tokio::task::JoinHandle<()>)`, compiled under `cfg(test)` or feature `test-fixture`. Tools: `echo {message}` returns `"Echo: <message>"`; `sleep {ms}` returns `"slept"`; `create_ticket {title, priority: low|high, tags: [string], address: {city, zip?}}`.

- [ ] **Step 1: Add dependencies**

Replace the `[dependencies]` section of `crates/anvil-core/Cargo.toml` and add the new sections:
```toml
[features]
# Exposes `anvil_core::fixture`, an in-process MCP server, to other crates' tests.
test-fixture = ["dep:schemars", "rmcp/server", "rmcp/macros"]

[dependencies]
rmcp = { workspace = true, features = ["client", "transport-child-process", "transport-async-rw"] }
schemars = { workspace = true, optional = true }
serde.workspace = true
serde_json.workspace = true
thiserror.workspace = true
tokio = { workspace = true, features = ["process", "io-util", "time", "sync", "rt", "macros"] }

[dev-dependencies]
rmcp = { workspace = true, features = ["server", "macros"] }
schemars.workspace = true
tokio = { workspace = true, features = ["full"] }
```

Update `crates/anvil-core/src/lib.rs`:
```rust
//! Protocol, transport and domain logic for MCP Anvil. Nothing in this crate knows about Tauri or the UI.

pub mod error;
#[cfg(any(test, feature = "test-fixture"))]
pub mod fixture;
pub mod model;
pub mod session;

pub use error::CoreError;
pub use model::{ServerSummary, ToolSummary};
pub use session::{McpSession, SessionOptions};
```

- [ ] **Step 2: Write the fixture server**

`crates/anvil-core/src/fixture.rs`:
```rust
//! An in-process MCP server for tests, here and in `src-tauri` (via the `test-fixture` feature).

use std::time::Duration;

use rmcp::{ServiceExt, handler::server::wrapper::Parameters, tool, tool_router};
use schemars::JsonSchema;
use serde::Deserialize;
use tokio::{io::DuplexStream, task::JoinHandle};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EchoParams {
    pub message: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SleepParams {
    pub ms: u64,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    High,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct Address {
    pub city: String,
    pub zip: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TicketParams {
    pub title: String,
    pub priority: Priority,
    pub tags: Vec<String>,
    pub address: Address,
}

#[derive(Debug, Clone)]
pub struct FixtureServer;

#[tool_router(server_handler)]
impl FixtureServer {
    #[tool(description = "Echo the message back")]
    fn echo(&self, Parameters(p): Parameters<EchoParams>) -> String {
        format!("Echo: {}", p.message)
    }

    #[tool(description = "Sleep for `ms` milliseconds, then answer")]
    async fn sleep(&self, Parameters(p): Parameters<SleepParams>) -> String {
        tokio::time::sleep(Duration::from_millis(p.ms)).await;
        "slept".to_owned()
    }

    #[tool(description = "Create a support ticket")]
    fn create_ticket(&self, Parameters(p): Parameters<TicketParams>) -> String {
        format!("{} [{:?}] {} tags, {}", p.title, p.priority, p.tags.len(), p.address.city)
    }
}

/// Starts the fixture on one end of an in-memory pipe. Returns the client end and the server task;
/// abort the task to simulate the server dying.
pub fn spawn_fixture() -> (DuplexStream, JoinHandle<()>) {
    let (client_io, server_io) = tokio::io::duplex(64 * 1024);
    let handle = tokio::spawn(async move {
        if let Ok(running) = FixtureServer.serve(server_io).await {
            let _ = running.waiting().await;
        }
    });
    (client_io, handle)
}
```

- [ ] **Step 3: Write the failing tests**

`crates/anvil-core/src/session.rs`, with tests only for now:
```rust
#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::{Map, Value, json};

    use super::*;
    use crate::fixture::spawn_fixture;

    fn args(value: Value) -> Map<String, Value> {
        value.as_object().expect("object").clone()
    }

    async fn connect() -> (McpSession, tokio::task::JoinHandle<()>) {
        let (io, server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        (session, server)
    }

    #[tokio::test]
    async fn connects_and_lists_fixture_tools() {
        let (session, _server) = connect().await;
        assert!(!session.server().protocol_version.is_empty());
        let mut names: Vec<String> = session.list_tools().await.unwrap().into_iter().map(|t| t.name).collect();
        names.sort();
        assert_eq!(names, ["create_ticket", "echo", "sleep"]);
    }

    #[tokio::test]
    async fn nested_params_arrive_as_json_schema() {
        let (session, _server) = connect().await;
        let tools = session.list_tools().await.unwrap();
        let ticket = tools.iter().find(|t| t.name == "create_ticket").unwrap();
        let properties = &ticket.input_schema["properties"];
        for key in ["title", "priority", "tags", "address"] {
            assert!(properties[key].is_object(), "missing {key} in {properties}");
        }
    }

    #[tokio::test]
    async fn calls_a_tool_and_returns_wire_json() {
        let (session, _server) = connect().await;
        let result = session.call_tool("echo", args(json!({ "message": "hi" }))).await.unwrap();
        assert_eq!(result["content"][0]["text"], "Echo: hi");
        assert_ne!(result.get("isError"), Some(&Value::Bool(true)));
    }

    #[tokio::test]
    async fn an_unknown_tool_is_a_protocol_error() {
        let (session, _server) = connect().await;
        let error = session.call_tool("nope", Map::new()).await.unwrap_err();
        assert!(matches!(error, CoreError::Protocol(_)), "{error:?}");
    }

    #[tokio::test]
    async fn slow_requests_time_out() {
        let (io, _server) = spawn_fixture();
        let options = SessionOptions { request_timeout: Duration::from_millis(100), ..SessionOptions::default() };
        let session = McpSession::connect_with(io, options).await.unwrap();
        let error = session.call_tool("sleep", args(json!({ "ms": 5000 }))).await.unwrap_err();
        assert!(matches!(error, CoreError::Timeout { what: "tools/call", .. }), "{error:?}");
    }

    #[tokio::test]
    async fn a_silent_peer_times_out_during_initialize() {
        let (io, _peer_kept_open) = tokio::io::duplex(1024);
        let options = SessionOptions { connect_timeout: Duration::from_millis(100), ..SessionOptions::default() };
        let error = McpSession::connect_with(io, options).await.unwrap_err();
        assert!(matches!(error, CoreError::Timeout { what: "initialize", .. }), "{error:?}");
    }

    #[tokio::test]
    async fn the_server_going_away_surfaces_as_disconnected() {
        let (session, server) = connect().await;
        server.abort();
        let _ = server.await;
        tokio::time::sleep(Duration::from_millis(50)).await;
        let error = session.list_tools().await.unwrap_err();
        assert!(matches!(error, CoreError::Disconnected), "{error:?}");
    }

    #[tokio::test]
    async fn close_is_idempotent_and_blocks_further_requests() {
        let (session, _server) = connect().await;
        session.close().await;
        session.close().await;
        let error = session.list_tools().await.unwrap_err();
        assert!(matches!(error, CoreError::Disconnected), "{error:?}");
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cargo test -p anvil-core session`
Expected: FAIL to compile, because `McpSession` and `SessionOptions` are not defined.

- [ ] **Step 5: Implement the session**

Prepend to `crates/anvil-core/src/session.rs`, above the tests:
```rust
use std::{fmt, future::Future, time::Duration};

use rmcp::{
    RoleClient, ServiceError, ServiceExt,
    model::CallToolRequestParams,
    service::{Peer, RunningService},
    transport::IntoTransport,
};
use serde_json::{Map, Value, json};
use tokio::sync::Mutex;

use crate::{CoreError, ServerSummary, ToolSummary};

#[derive(Debug, Clone, Copy)]
pub struct SessionOptions {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
}

impl Default for SessionOptions {
    fn default() -> Self {
        Self { connect_timeout: Duration::from_secs(30), request_timeout: Duration::from_secs(60) }
    }
}

/// One initialized MCP client session. Requests go through a cloned `Peer`, so a long call never blocks `close`.
pub struct McpSession {
    peer: Peer<RoleClient>,
    service: Mutex<Option<RunningService<RoleClient, ()>>>,
    server: ServerSummary,
    options: SessionOptions,
}

impl fmt::Debug for McpSession {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("McpSession").field("server", &self.server).finish_non_exhaustive()
    }
}

impl McpSession {
    pub async fn connect_with<T, E, A>(transport: T, options: SessionOptions) -> Result<Self, CoreError>
    where
        T: IntoTransport<RoleClient, E, A>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let service = tokio::time::timeout(options.connect_timeout, ().serve(transport))
            .await
            .map_err(|_| CoreError::Timeout { what: "initialize", after: options.connect_timeout })?
            .map_err(|e| CoreError::Protocol(e.to_string()))?;
        let info = serde_json::to_value(service.peer_info()).map_err(|e| CoreError::InvalidData(e.to_string()))?;
        let server = ServerSummary::from_initialize_result(info)?;
        Ok(Self { peer: service.peer().clone(), service: Mutex::new(Some(service)), server, options })
    }

    pub fn server(&self) -> &ServerSummary {
        &self.server
    }

    pub async fn list_tools(&self) -> Result<Vec<ToolSummary>, CoreError> {
        let tools = self.request("tools/list", self.peer.list_all_tools()).await?;
        tools
            .into_iter()
            .map(|tool| {
                serde_json::to_value(tool)
                    .map_err(|e| CoreError::InvalidData(e.to_string()))
                    .and_then(ToolSummary::from_wire)
            })
            .collect()
    }

    pub async fn call_tool(&self, name: &str, arguments: Map<String, Value>) -> Result<Value, CoreError> {
        // Built through serde so we depend on the MCP wire shape, not on rmcp's constructor API.
        let params: CallToolRequestParams = serde_json::from_value(json!({ "name": name, "arguments": arguments }))
            .map_err(|e| CoreError::InvalidData(e.to_string()))?;
        let result = self.request("tools/call", self.peer.call_tool(params)).await?;
        serde_json::to_value(result).map_err(|e| CoreError::InvalidData(e.to_string()))
    }

    /// Ends the session and, for child-process transports, stops the server. Safe to call more than once.
    pub async fn close(&self) {
        let service = self.service.lock().await.take();
        if let Some(service) = service {
            let _ = service.cancel().await;
        }
    }

    async fn request<T>(
        &self,
        what: &'static str,
        request: impl Future<Output = Result<T, ServiceError>>,
    ) -> Result<T, CoreError> {
        if self.service.lock().await.is_none() {
            return Err(CoreError::Disconnected);
        }
        match tokio::time::timeout(self.options.request_timeout, request).await {
            Err(_) => Err(CoreError::Timeout { what, after: self.options.request_timeout }),
            Ok(Err(error)) => Err(map_service_error(error)),
            Ok(Ok(value)) => Ok(value),
        }
    }
}

fn map_service_error(error: ServiceError) -> CoreError {
    match error {
        ServiceError::TransportClosed => CoreError::Disconnected,
        other => CoreError::Protocol(other.to_string()),
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test -p anvil-core`
Expected: all tests pass (8 from Task 2 plus 8 new).

If a name does not compile against rmcp 3.4.1, look it up in the crate source instead of guessing. On Windows the source is under `%USERPROFILE%\.cargo\registry\src\*\rmcp-3.4.1\src`. The likely spots:
- `ServiceError` variants: search for `pub enum ServiceError`. Map every variant that means "the transport is gone" (closed, send failure after close) to `CoreError::Disconnected`.
- `peer_info` / `peer`: search for `pub fn peer_info` and `pub fn peer` on `RunningService` or `Peer`.
- `list_all_tools` / `call_tool`: search in `src/service/client.rs`.

If `the_server_going_away_surfaces_as_disconnected` returns `Protocol(..)`, print the error. Add the variant it reports to the `Disconnected` arm only if that variant means the transport closed.

- [ ] **Step 7: Lint and commit**

Run: `cargo clippy --workspace --all-targets -- -D warnings` then `cargo fmt --all -- --check`

```bash
git add crates Cargo.lock
git commit -m "feat(core): add McpSession with timeouts, disconnect detection and test fixture" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Stdio transport with consent, env allowlist and stderr capture

**Files:**
- Create: `crates/anvil-core/src/stdio.rs`, `crates/anvil-core/tests/stdio_everything.rs`
- Modify: `crates/anvil-core/Cargo.toml`, `crates/anvil-core/src/lib.rs`
- Test: unit tests in `stdio.rs`; integration tests in `tests/stdio_everything.rs`

**Interfaces:**
- Consumes: `McpSession::connect_with`, `SessionOptions`, `CoreError` (Tasks 2–3); `node_modules/@modelcontextprotocol/server-everything/dist/index.js` (Task 1).
- Produces (module `anvil_core::stdio`):
  - `StdioSpec { command: String, args: Vec<String>, env: BTreeMap<String, String>, cwd: Option<PathBuf> }`, serde camelCase, with `args`/`env`/`cwd` defaulted. Derives `Debug, Clone, PartialEq, Eq, Serialize, Deserialize`.
  - `SpawnConsent::granted_for(&StdioSpec) -> SpawnConsent` and `SpawnConsent::covers(&self, &StdioSpec) -> bool`.
  - `child_env(&StdioSpec, parent: impl IntoIterator<Item = (String, String)>) -> BTreeMap<String, String>`.
  - `resolve_command(command: &str, path_var: Option<&str>, cwd: &Path) -> Result<PathBuf, CoreError>`.
  - `StderrTail` (`Clone + Default + Debug`) with `push(String)` and `lines() -> Vec<String>`.
  - `ProcessInfo { pid: Option<u32>, stderr: StderrTail }` (`Debug, Clone`).
  - `StdioConnection { session: McpSession, process: ProcessInfo }` (`Debug`).
  - `async fn connect_stdio(spec: &StdioSpec, consent: &SpawnConsent, options: SessionOptions) -> Result<StdioConnection, CoreError>`.

- [ ] **Step 1: Add dependencies**

In `crates/anvil-core/Cargo.toml` add to `[dependencies]`:
```toml
which.workspace = true
```
and to `[dev-dependencies]`:
```toml
sysinfo = "0.39"
```

In `crates/anvil-core/src/lib.rs` add `pub mod stdio;` after `pub mod session;`.

- [ ] **Step 2: Write the failing unit tests**

`crates/anvil-core/src/stdio.rs`, with tests only for now:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> StdioSpec {
        StdioSpec { command: "node".into(), args: vec!["server.js".into()], env: BTreeMap::new(), cwd: None }
    }

    #[test]
    fn consent_covers_only_the_exact_spec() {
        let consent = SpawnConsent::granted_for(&spec());
        assert!(consent.covers(&spec()));
        let mut other = spec();
        other.args.push("--evil".into());
        assert!(!consent.covers(&other));
    }

    #[test]
    fn child_env_keeps_the_allowlist_and_drops_secrets() {
        let parent = [
            ("PATH".to_string(), "/usr/bin".to_string()),
            ("AWS_SECRET_ACCESS_KEY".to_string(), "hunter2".to_string()),
            ("OPENAI_API_KEY".to_string(), "sk-live".to_string()),
        ];
        let env = child_env(&spec(), parent);
        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin"));
        assert!(!env.contains_key("AWS_SECRET_ACCESS_KEY"));
        assert!(!env.contains_key("OPENAI_API_KEY"));
    }

    #[test]
    fn child_env_matches_allowlisted_names_case_insensitively() {
        let env = child_env(&spec(), [("Path".to_string(), "C:\\Windows".to_string())]);
        assert_eq!(env.get("Path").map(String::as_str), Some("C:\\Windows"));
    }

    #[test]
    fn child_env_skips_exported_shell_functions() {
        let env = child_env(&spec(), [("PATH".to_string(), "() { :; }; echo pwned".to_string())]);
        assert!(!env.contains_key("PATH"));
    }

    #[test]
    fn user_env_is_passed_and_overrides_the_parent() {
        let mut s = spec();
        s.env.insert("PATH".into(), "/custom".into());
        s.env.insert("GITHUB_TOKEN".into(), "explicitly-provided".into());
        let env = child_env(&s, [("PATH".to_string(), "/usr/bin".to_string())]);
        assert_eq!(env.get("PATH").map(String::as_str), Some("/custom"));
        assert_eq!(env.get("GITHUB_TOKEN").map(String::as_str), Some("explicitly-provided"));
    }

    #[test]
    fn resolves_commands_on_path_and_names_missing_ones() {
        let cwd = std::env::current_dir().unwrap();
        let path = std::env::var("PATH").ok();
        assert!(resolve_command("node", path.as_deref(), &cwd).is_ok(), "node must be on PATH for tests");
        let error = resolve_command("anvil-definitely-not-installed", path.as_deref(), &cwd).unwrap_err();
        assert!(matches!(&error, CoreError::CommandNotFound(name) if name == "anvil-definitely-not-installed"));
    }

    #[cfg(windows)]
    #[test]
    fn npx_resolves_to_its_cmd_shim() {
        let cwd = std::env::current_dir().unwrap();
        let path = std::env::var("PATH").ok();
        let resolved = resolve_command("npx", path.as_deref(), &cwd).expect("npx on PATH");
        let extension = resolved.extension().and_then(|e| e.to_str()).unwrap_or_default();
        assert!(extension.eq_ignore_ascii_case("cmd"), "resolved to {}", resolved.display());
    }

    #[test]
    fn stderr_tail_keeps_the_last_lines_and_truncates_long_ones() {
        let tail = StderrTail::default();
        for i in 0..(STDERR_MAX_LINES + 5) {
            tail.push(format!("line {i}"));
        }
        let lines = tail.lines();
        assert_eq!(lines.len(), STDERR_MAX_LINES);
        assert_eq!(lines[0], "line 5");

        tail.push("é".repeat(STDERR_MAX_LINE_BYTES));
        let last = tail.lines().pop().unwrap();
        assert!(last.len() <= STDERR_MAX_LINE_BYTES + '…'.len_utf8());
        assert!(last.ends_with('…'));
    }
}
```

- [ ] **Step 3: Write the failing integration tests**

`crates/anvil-core/tests/stdio_everything.rs`:
```rust
//! Integration tests against the reference server. Requires `pnpm install` at the repo root and `node` on PATH.

use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

use anvil_core::{
    CoreError, SessionOptions,
    stdio::{SpawnConsent, StdioConnection, StdioSpec, connect_stdio},
};
use serde_json::json;
use sysinfo::{Pid, ProcessStatus, ProcessesToUpdate, System};

fn everything() -> StdioSpec {
    let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../node_modules/@modelcontextprotocol/server-everything/dist/index.js");
    assert!(entry.exists(), "missing {}: run `pnpm install` at the repo root", entry.display());
    StdioSpec {
        command: "node".into(),
        args: vec![entry.to_string_lossy().into_owned(), "stdio".into()],
        env: Default::default(),
        cwd: None,
    }
}

async fn connect(spec: &StdioSpec) -> Result<StdioConnection, CoreError> {
    connect_stdio(spec, &SpawnConsent::granted_for(spec), SessionOptions::default()).await
}

fn is_running(pid: u32) -> bool {
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    system.process(pid).is_some_and(|p| p.status() != ProcessStatus::Zombie)
}

async fn wait_until_gone(pid: u32, within: Duration) -> bool {
    let deadline = Instant::now() + within;
    while Instant::now() < deadline {
        if !is_running(pid) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    !is_running(pid)
}

#[tokio::test]
async fn lists_tools_within_two_seconds_and_calls_echo() {
    let conn = connect(&everything()).await.expect("connect");
    let started = Instant::now();
    let tools = conn.session.list_tools().await.expect("tools/list");
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_secs(2), "tools/list took {elapsed:?}");
    assert!(
        tools.iter().any(|t| t.name == "echo"),
        "echo missing from {:?}",
        tools.iter().map(|t| &t.name).collect::<Vec<_>>()
    );

    let arguments = json!({ "message": "hello anvil" }).as_object().unwrap().clone();
    let result = conn.session.call_tool("echo", arguments).await.expect("tools/call");
    assert!(result.to_string().contains("hello anvil"), "{result}");
    conn.session.close().await;
}

#[tokio::test]
async fn disconnect_terminates_the_child_process() {
    let conn = connect(&everything()).await.expect("connect");
    let pid = conn.process.pid.expect("pid");
    assert!(is_running(pid));
    conn.session.close().await;
    assert!(wait_until_gone(pid, Duration::from_secs(5)).await, "server {pid} still running after close");
}

#[tokio::test]
async fn a_crash_mid_session_reports_disconnected() {
    let conn = connect(&everything()).await.expect("connect");
    let pid = conn.process.pid.expect("pid");
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true);
    assert!(system.process(Pid::from_u32(pid)).expect("process").kill());
    assert!(wait_until_gone(pid, Duration::from_secs(5)).await);

    let error = conn.session.list_tools().await.unwrap_err();
    assert!(matches!(error, CoreError::Disconnected), "{error:?}");
}

#[tokio::test]
async fn a_missing_command_is_reported_by_name() {
    let spec = StdioSpec {
        command: "anvil-definitely-not-installed".into(),
        args: vec![],
        env: Default::default(),
        cwd: None,
    };
    let error = connect(&spec).await.unwrap_err();
    assert!(matches!(error, CoreError::CommandNotFound(_)), "{error:?}");
}

#[tokio::test]
async fn a_server_that_dies_at_startup_reports_its_stderr() {
    let spec = StdioSpec {
        command: "node".into(),
        args: vec!["-e".into(), "console.error('boom: missing API key'); process.exit(3)".into()],
        env: Default::default(),
        cwd: None,
    };
    let error = connect(&spec).await.unwrap_err();
    let CoreError::StartupFailed { stderr_tail, .. } = &error else { panic!("expected StartupFailed, got {error:?}") };
    assert!(stderr_tail.iter().any(|l| l.contains("boom: missing API key")), "{stderr_tail:?}");
}

#[tokio::test]
async fn consent_must_match_the_spawned_command() {
    let consent = SpawnConsent::granted_for(&everything());
    let mut other = everything();
    other.args.push("--extra".into());
    let error = connect_stdio(&other, &consent, SessionOptions::default()).await.unwrap_err();
    assert!(matches!(error, CoreError::ConsentMismatch), "{error:?}");
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cargo test -p anvil-core --all-targets`
Expected: FAIL to compile, because `stdio` items are not defined.

- [ ] **Step 5: Implement `stdio.rs`**

Prepend to `crates/anvil-core/src/stdio.rs`, above the tests:
```rust
//! Spawning local MCP servers over stdio: consent, a minimal environment, command resolution and stderr capture.

use std::{
    collections::{BTreeMap, VecDeque},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};

use rmcp::transport::TokioChildProcess;
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::{ChildStderr, Command},
};

use crate::{CoreError, McpSession, SessionOptions};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StdioSpec {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub cwd: Option<PathBuf>,
}

/// Evidence that the user approved spawning exactly this spec. Build it only in response to an explicit user action.
#[derive(Debug, Clone)]
pub struct SpawnConsent {
    approved: StdioSpec,
}

impl SpawnConsent {
    pub fn granted_for(spec: &StdioSpec) -> Self {
        Self { approved: spec.clone() }
    }

    pub fn covers(&self, spec: &StdioSpec) -> bool {
        &self.approved == spec
    }
}

// Mirrors the default environment the official MCP SDKs pass to stdio servers.
#[cfg(windows)]
const INHERITED_ENV: &[&str] = &[
    "APPDATA", "COMSPEC", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE",
    "PROGRAMFILES", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "USERNAME", "USERPROFILE", "WINDIR",
];
#[cfg(not(windows))]
const INHERITED_ENV: &[&str] = &["HOME", "LANG", "LOGNAME", "PATH", "SHELL", "TERM", "TMPDIR", "USER"];

/// The environment a spawned server gets: the allowlist from `parent`, then the user's explicit variables on top.
/// Secrets in the parent environment (API keys, cloud credentials) are not inherited.
pub fn child_env(spec: &StdioSpec, parent: impl IntoIterator<Item = (String, String)>) -> BTreeMap<String, String> {
    let mut env: BTreeMap<String, String> = parent
        .into_iter()
        .filter(|(name, value)| {
            INHERITED_ENV.iter().any(|allowed| allowed.eq_ignore_ascii_case(name)) && !value.starts_with("()")
        })
        .collect();
    env.extend(spec.env.iter().map(|(k, v)| (k.clone(), v.clone())));
    env
}

/// Finds the executable, including Windows `.cmd`/`.bat` shims such as `npx.cmd` via PATHEXT.
pub fn resolve_command(command: &str, path_var: Option<&str>, cwd: &Path) -> Result<PathBuf, CoreError> {
    which::which_in(command, path_var, cwd).map_err(|_| CoreError::CommandNotFound(command.to_owned()))
}

const STDERR_MAX_LINES: usize = 200;
const STDERR_MAX_LINE_BYTES: usize = 2048;
const STDERR_MAX_READ: u64 = 64 * 1024;

/// The last lines a server wrote to stderr, bounded so a noisy server cannot exhaust memory.
#[derive(Debug, Clone, Default)]
pub struct StderrTail(Arc<Mutex<VecDeque<String>>>);

impl StderrTail {
    pub fn push(&self, mut line: String) {
        if line.len() > STDERR_MAX_LINE_BYTES {
            let mut cut = STDERR_MAX_LINE_BYTES;
            while !line.is_char_boundary(cut) {
                cut -= 1;
            }
            line.truncate(cut);
            line.push('…');
        }
        let mut lines = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if lines.len() == STDERR_MAX_LINES {
            lines.pop_front();
        }
        lines.push_back(line);
    }

    pub fn lines(&self) -> Vec<String> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).iter().cloned().collect()
    }
}

fn capture_stderr(stderr: ChildStderr, tail: StderrTail) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match (&mut reader).take(STDERR_MAX_READ).read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => tail.push(String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_owned()),
            }
        }
    });
}

#[derive(Debug, Clone)]
pub struct ProcessInfo {
    pub pid: Option<u32>,
    pub stderr: StderrTail,
}

#[derive(Debug)]
pub struct StdioConnection {
    pub session: McpSession,
    pub process: ProcessInfo,
}

pub async fn connect_stdio(
    spec: &StdioSpec,
    consent: &SpawnConsent,
    options: SessionOptions,
) -> Result<StdioConnection, CoreError> {
    if !consent.covers(spec) {
        return Err(CoreError::ConsentMismatch);
    }
    let cwd = match &spec.cwd {
        Some(dir) => dir.clone(),
        None => std::env::current_dir()?,
    };
    let env = child_env(spec, std::env::vars());
    let path_var = env.iter().find(|(name, _)| name.eq_ignore_ascii_case("PATH")).map(|(_, v)| v.as_str());
    let program = resolve_command(&spec.command, path_var, &cwd)?;

    let mut command = Command::new(program);
    command.args(&spec.args).env_clear().envs(&env).current_dir(&cwd);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console window flashes up.

    let (transport, stderr) = TokioChildProcess::builder(command).stderr(Stdio::piped()).spawn()?;
    let pid = transport.id();
    let tail = StderrTail::default();
    if let Some(stderr) = stderr {
        capture_stderr(stderr, tail.clone());
    }

    match McpSession::connect_with(transport, options).await {
        Ok(session) => Ok(StdioConnection { session, process: ProcessInfo { pid, stderr: tail } }),
        Err(timeout @ CoreError::Timeout { .. }) => Err(timeout),
        Err(other) => {
            // Let the stderr reader drain what the process printed before it died.
            tokio::time::sleep(Duration::from_millis(200)).await;
            Err(CoreError::StartupFailed { reason: other.to_string(), stderr_tail: tail.lines() })
        }
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cargo test -p anvil-core --all-targets`
Expected: all unit and integration tests pass. `npx_resolves_to_its_cmd_shim` runs on Windows only.

If `TokioChildProcess::builder(..).stderr(..).spawn()` or `transport.id()` does not compile, check `src/transport/child_process.rs` in the rmcp 3.4.1 source (see Task 3 Step 6 for the path). Keep the same behavior: stderr piped to us, pid recorded, kill on drop.

If `disconnect_terminates_the_child_process` fails, the transport does not stop the child on `cancel`. Keep the `tokio::process::Child` handle yourself and kill it in `McpSession::close`. Record that change in ADR-0004.

- [ ] **Step 7: Lint and commit**

Run: `cargo clippy --workspace --all-targets -- -D warnings` then `cargo fmt --all -- --check`

```bash
git add crates Cargo.lock
git commit -m "feat(core): spawn stdio servers with consent, env allowlist and stderr capture" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tauri shell, connection registry and commands

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/app-icon.svg`, `src-tauri/icons/*` (generated)
- Create: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/registry.rs`, `src-tauri/src/commands.rs`
- Modify: `Cargo.toml` (workspace members)
- Test: unit tests in `src-tauri/src/registry.rs`

**Interfaces:**
- Consumes: `McpSession`, `SessionOptions`, `CoreError::{kind, stderr_tail}`, `ServerSummary`, `ToolSummary`, `stdio::{StdioSpec, SpawnConsent, ProcessInfo, StdioConnection, connect_stdio}`, `fixture::spawn_fixture` (Tasks 2–4); `dist/` from `pnpm build` (Task 1).
- Produces, as IPC contract for the frontend (argument names are camelCase in JS):
  - `connect_stdio({ spec: StdioSpec, consented: boolean }) -> { connectionId: string, server: ServerSummary }`
  - `list_tools({ connectionId }) -> ToolSummary[]`
  - `call_tool({ connectionId, name, arguments: object }) -> CallToolResult JSON`
  - `disconnect({ connectionId }) -> null`
  - Every failure rejects with `IpcError { kind: string, message: string, stderrTail: string[] }`. `kind` is one of the `CoreError::kind()` values plus `"notFound"` and `"consentRequired"`.

- [ ] **Step 1: Write the crate and config files**

Root `Cargo.toml`: change `members` to `["crates/anvil-core", "src-tauri"]`.

`src-tauri/Cargo.toml`:
```toml
[package]
name = "anvil-app"
version = "0.1.0"
description = "MCP Anvil desktop app"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[lib]
name = "anvil_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.6", features = [] }

[dependencies]
anvil-core = { path = "../crates/anvil-core" }
serde.workspace = true
serde_json.workspace = true
tauri = { version = "2.11.6", features = [] }
uuid = { version = "1.26", features = ["v4"] }

[dev-dependencies]
anvil-core = { path = "../crates/anvil-core", features = ["test-fixture"] }
tokio = { workspace = true, features = ["macros", "rt-multi-thread", "time"] }

[lints]
workspace = true
```

`src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/tauri.conf.json` (the identifier is a placeholder: change it before the first public release):
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "MCP Anvil",
  "version": "0.1.0",
  "identifier": "app.mcpanvil.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://127.0.0.1:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "label": "main", "title": "MCP Anvil", "width": 1280, "height": 800, "minWidth": 900, "minHeight": 600 }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ipc: http://ipc.localhost",
      "devCsp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

`src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window gets core only. No shell or fs plugins: processes are spawned in Rust, after consent.",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

`src-tauri/app-icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="#1d1d1b"/>
  <path d="M232 360h440c0 88 64 136 160 136v48c-120 0-176 40-200 104H392c-24-64-80-104-160-120z" fill="#f0773a"/>
  <path d="M392 648h240l40 136H352z" fill="#ecebe6"/>
</svg>
```

Generate icons:
```bash
pnpm tauri icon src-tauri/app-icon.svg
```
Expected: `src-tauri/icons/` contains `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`.

`src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    anvil_app_lib::run()
}
```

- [ ] **Step 2: Write the failing registry tests**

`src-tauri/src/registry.rs`, with tests only for now:
```rust
#[cfg(test)]
mod tests {
    use anvil_core::{CoreError, McpSession, SessionOptions, fixture::spawn_fixture};
    use serde_json::json;

    use super::*;

    async fn fixture_connection() -> Connection {
        let (io, _server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        Connection { session, process: None }
    }

    #[tokio::test]
    async fn lists_and_calls_tools_by_connection_id() {
        let registry = Registry::default();
        let id = registry.insert(fixture_connection().await);
        assert_eq!(registry.list_tools(&id).await.unwrap().len(), 3);
        let arguments = json!({ "message": "hi" }).as_object().unwrap().clone();
        let result = registry.call_tool(&id, "echo", arguments).await.unwrap();
        assert_eq!(result["content"][0]["text"], "Echo: hi");
    }

    #[tokio::test]
    async fn unknown_ids_are_not_found() {
        let registry = Registry::default();
        let error = registry.list_tools("missing").await.unwrap_err();
        assert_eq!(error.kind, "notFound");
    }

    #[tokio::test]
    async fn disconnect_removes_and_closes_the_session() {
        let registry = Registry::default();
        let id = registry.insert(fixture_connection().await);
        let connection = registry.get(&id).unwrap();
        registry.disconnect(&id).await.unwrap();
        assert_eq!(registry.open_count(), 0);
        assert_eq!(registry.list_tools(&id).await.unwrap_err().kind, "notFound");
        assert!(matches!(connection.session.list_tools().await, Err(CoreError::Disconnected)));
    }

    #[tokio::test]
    async fn close_all_closes_every_connection() {
        let registry = Registry::default();
        let a = registry.insert(fixture_connection().await);
        let b = registry.insert(fixture_connection().await);
        let (conn_a, conn_b) = (registry.get(&a).unwrap(), registry.get(&b).unwrap());
        registry.close_all().await;
        assert_eq!(registry.open_count(), 0);
        assert!(matches!(conn_a.session.list_tools().await, Err(CoreError::Disconnected)));
        assert!(matches!(conn_b.session.list_tools().await, Err(CoreError::Disconnected)));
    }

    #[test]
    fn core_errors_become_camel_case_ipc_errors() {
        let error = IpcError::from(CoreError::StartupFailed { reason: "exited".into(), stderr_tail: vec!["boom".into()] });
        let wire = serde_json::to_value(&error).unwrap();
        assert_eq!(wire["kind"], "startupFailed");
        assert_eq!(wire["message"], "the server failed to start: exited");
        assert_eq!(wire["stderrTail"], json!(["boom"]));
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

First run `pnpm build` so `dist/` exists; `tauri::generate_context!()` needs it at compile time.

Run: `cargo test -p anvil-app`
Expected: FAIL to compile, because `Registry`, `Connection` and `IpcError` are not defined, and `lib.rs` is missing.

- [ ] **Step 4: Implement the registry, commands and app entry**

Prepend to `src-tauri/src/registry.rs`, above the tests:
```rust
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};

use anvil_core::{
    CoreError, McpSession, ToolSummary,
    stdio::{ProcessInfo, StdioConnection},
};
use serde::Serialize;
use serde_json::{Map, Value};

/// The shape every failed command rejects with on the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub kind: &'static str,
    pub message: String,
    pub stderr_tail: Vec<String>,
}

impl From<CoreError> for IpcError {
    fn from(error: CoreError) -> Self {
        Self { kind: error.kind(), message: error.to_string(), stderr_tail: error.stderr_tail().to_vec() }
    }
}

impl IpcError {
    pub fn not_found(id: &str) -> Self {
        Self { kind: "notFound", message: format!("no open connection with id {id}"), stderr_tail: Vec::new() }
    }

    pub fn consent_required() -> Self {
        Self {
            kind: "consentRequired",
            message: "starting a local command requires explicit consent".into(),
            stderr_tail: Vec::new(),
        }
    }
}

pub struct Connection {
    pub session: McpSession,
    pub process: Option<ProcessInfo>,
}

impl From<StdioConnection> for Connection {
    fn from(connection: StdioConnection) -> Self {
        Self { session: connection.session, process: Some(connection.process) }
    }
}

/// Open connections by id. The lock is never held across an await, so a slow tool call never blocks disconnect.
#[derive(Default)]
pub struct Registry {
    connections: Mutex<HashMap<String, Arc<Connection>>>,
}

impl Registry {
    pub fn insert(&self, connection: Connection) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.lock().insert(id.clone(), Arc::new(connection));
        id
    }

    pub fn open_count(&self) -> usize {
        self.lock().len()
    }

    pub async fn list_tools(&self, id: &str) -> Result<Vec<ToolSummary>, IpcError> {
        let connection = self.get(id)?;
        Ok(connection.session.list_tools().await?)
    }

    pub async fn call_tool(&self, id: &str, name: &str, arguments: Map<String, Value>) -> Result<Value, IpcError> {
        let connection = self.get(id)?;
        Ok(connection.session.call_tool(name, arguments).await?)
    }

    pub async fn disconnect(&self, id: &str) -> Result<(), IpcError> {
        let connection = self.lock().remove(id).ok_or_else(|| IpcError::not_found(id))?;
        connection.session.close().await;
        Ok(())
    }

    pub async fn close_all(&self) {
        let connections: Vec<Arc<Connection>> = self.lock().drain().map(|(_, c)| c).collect();
        for connection in connections {
            connection.session.close().await;
        }
    }

    fn get(&self, id: &str) -> Result<Arc<Connection>, IpcError> {
        self.lock().get(id).cloned().ok_or_else(|| IpcError::not_found(id))
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, Arc<Connection>>> {
        self.connections.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
```

`src-tauri/src/commands.rs`:
```rust
use anvil_core::{
    ServerSummary, SessionOptions, ToolSummary,
    stdio::{self, SpawnConsent, StdioSpec},
};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::State;

use crate::registry::{IpcError, Registry};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub connection_id: String,
    pub server: ServerSummary,
}

#[tauri::command]
pub async fn connect_stdio(
    registry: State<'_, Registry>,
    spec: StdioSpec,
    consented: bool,
) -> Result<ConnectResult, IpcError> {
    // `consented` is sent only by the consent dialog's confirm button, which shows this exact command line.
    if !consented {
        return Err(IpcError::consent_required());
    }
    let consent = SpawnConsent::granted_for(&spec);
    let connection = stdio::connect_stdio(&spec, &consent, SessionOptions::default()).await?;
    let server = connection.session.server().clone();
    Ok(ConnectResult { connection_id: registry.insert(connection.into()), server })
}

#[tauri::command]
pub async fn list_tools(registry: State<'_, Registry>, connection_id: String) -> Result<Vec<ToolSummary>, IpcError> {
    registry.list_tools(&connection_id).await
}

#[tauri::command]
pub async fn call_tool(
    registry: State<'_, Registry>,
    connection_id: String,
    name: String,
    arguments: Map<String, Value>,
) -> Result<Value, IpcError> {
    registry.call_tool(&connection_id, &name, arguments).await
}

#[tauri::command]
pub async fn disconnect(registry: State<'_, Registry>, connection_id: String) -> Result<(), IpcError> {
    registry.disconnect(&connection_id).await
}
```

`src-tauri/src/lib.rs`:
```rust
mod commands;
pub mod registry;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(registry::Registry::default())
        .invoke_handler(tauri::generate_handler![
            commands::connect_stdio,
            commands::list_tools,
            commands::call_tool,
            commands::disconnect,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the MCP Anvil app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Stop every server we spawned so no child process outlives the app.
                tauri::async_runtime::block_on(app.state::<registry::Registry>().close_all());
            }
        });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cargo test --workspace` then `cargo clippy --workspace --all-targets -- -D warnings` then `cargo fmt --all -- --check`
Expected: all tests pass, including 5 new registry tests; no warnings.

- [ ] **Step 6: Smoke-launch the shell**

Run: `pnpm tauri dev`
Expected: a window titled "MCP Anvil" shows the heading. Close it; the terminal shows a clean exit.

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock src-tauri
git commit -m "feat(app): add Tauri shell with connection registry and MCP commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend IPC client, command-line parsing and connection store

**Files:**
- Create: `src/lib/types.ts`, `src/lib/ipc.ts`, `src/lib/commandLine.ts`, `src/state/connection.ts`
- Test: `src/lib/ipc.test.ts`, `src/lib/commandLine.test.ts`, `src/state/connection.test.ts`

**Interfaces:**
- Consumes: the IPC contract from Task 5; `Schema` type from Task 7 (`src/schema/types.ts`). Create that file now with the content given in Task 7 Step 1, and Task 7 keeps it unchanged.
- Produces:
  - `types.ts`: `StdioSpec { command; args: string[]; env: Record<string,string>; cwd: string | null }`, `ToolSummary { name; title?; description?; inputSchema: Schema; outputSchema?; annotations?; icons? }`, `ServerSummary { name; version; title?; protocolVersion; instructions?; capabilities }`, `IpcErrorPayload { kind; message; stderrTail }`.
  - `ipc.ts`: `class AnvilError extends Error { kind: string; stderrTail: string[] }`; `ipc.connectStdio(spec, consented)`, `ipc.listTools(id)`, `ipc.callTool(id, name, args)`, `ipc.disconnect(id)`; `ConnectResult`.
  - `commandLine.ts`: `parseCommandLine(input) -> { command, args }` (throws `Error` with a user-facing message); `formatCommandLine(spec) -> string`.
  - `state/connection.ts`: `useConnection` Zustand hook with state `{ status: "idle"|"awaiting-consent"|"connecting"|"connected"|"error", pendingSpec, connectionId, server, tools, toolsLoadMs, error }` and actions `requestConnect(spec)`, `cancelConnect()`, `confirmConnect()`, `disconnect()`, `handleCallError(error)`; `resetConnectionStore()` for tests.

- [ ] **Step 1: Write the types**

Create `src/schema/types.ts` exactly as in Task 7 Step 1.

`src/lib/types.ts`:
```ts
import type { Schema } from "../schema/types";

export interface StdioSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string | null;
}

export interface ToolSummary {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Schema;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
  icons?: unknown;
}

export interface ServerSummary {
  name: string;
  version: string;
  title?: string;
  protocolVersion: string;
  instructions?: string;
  capabilities: unknown;
}

export interface IpcErrorPayload {
  kind: string;
  message: string;
  stderrTail: string[];
}
```

- [ ] **Step 2: Write the failing tests**

`src/lib/commandLine.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatCommandLine, parseCommandLine } from "./commandLine";

describe("parseCommandLine", () => {
  it("splits on whitespace", () => {
    expect(parseCommandLine("  npx -y  @modelcontextprotocol/server-everything ")).toEqual({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
    });
  });

  it("keeps quoted segments with spaces and Windows backslashes intact", () => {
    expect(parseCommandLine('"C:\\Program Files\\nodejs\\node.exe" server.js --name \'my server\'')).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: ["server.js", "--name", "my server"],
    });
  });

  it("keeps empty quoted arguments", () => {
    expect(parseCommandLine('node s.js ""')).toEqual({ command: "node", args: ["s.js", ""] });
  });

  it("rejects empty input and unclosed quotes with readable messages", () => {
    expect(() => parseCommandLine("   ")).toThrow("Enter a command to run");
    expect(() => parseCommandLine('node "server.js')).toThrow("Unclosed quote in command");
  });
});

describe("formatCommandLine", () => {
  it("quotes only the parts that need it", () => {
    expect(
      formatCommandLine({ command: "C:\\Program Files\\node.exe", args: ["-y", "a b", ""], env: {}, cwd: null }),
    ).toBe('"C:\\Program Files\\node.exe" -y "a b" ""');
  });
});
```

`src/lib/ipc.test.ts`:
```ts
import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it } from "vitest";
import { AnvilError, ipc } from "./ipc";

const spec = { command: "npx", args: ["-y", "x"], env: {}, cwd: null };

describe("ipc", () => {
  it("sends camelCase arguments to the Rust commands", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "connect_stdio") return { connectionId: "c1", server: { name: "s", version: "1" } };
      return null;
    });
    await ipc.connectStdio(spec, true);
    await ipc.callTool("c1", "echo", { message: "hi" });
    expect(calls[0]).toEqual({ cmd: "connect_stdio", args: expect.objectContaining({ spec, consented: true }) });
    expect(calls[1]).toEqual({
      cmd: "call_tool",
      args: expect.objectContaining({ connectionId: "c1", name: "echo", arguments: { message: "hi" } }),
    });
  });

  it("turns IpcError payloads into AnvilError with kind and stderr tail", async () => {
    mockIPC(() => {
      throw { kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom"] };
    });
    const error = await ipc.connectStdio(spec, true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnvilError);
    expect(error).toMatchObject({ kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom"] });
  });

  it("wraps anything else as an unknown error", async () => {
    mockIPC(() => {
      throw "plain string";
    });
    const error = await ipc.listTools("c1").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "unknown", message: "plain string", stderrTail: [] });
  });
});
```

`src/state/connection.test.ts`:
```ts
import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { AnvilError } from "../lib/ipc";
import { resetConnectionStore, useConnection } from "./connection";

const spec = { command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], env: {}, cwd: null };
const server = { name: "everything", version: "2026.8.31", protocolVersion: "2025-11-25", capabilities: {} };
const tools = [{ name: "echo", inputSchema: { type: "object" } }];

describe("connection store", () => {
  let calls: string[];

  beforeEach(() => {
    resetConnectionStore();
    calls = [];
  });

  function mockServer(overrides: Record<string, () => unknown> = {}) {
    mockIPC((cmd) => {
      calls.push(cmd);
      if (overrides[cmd]) return overrides[cmd]();
      if (cmd === "connect_stdio") return { connectionId: "c1", server };
      if (cmd === "list_tools") return tools;
      return null;
    });
  }

  it("asks for consent before spawning anything", () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    expect(useConnection.getState()).toMatchObject({ status: "awaiting-consent", pendingSpec: spec });
    expect(calls).toEqual([]);
  });

  it("cancelling consent returns to idle without IPC", () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    useConnection.getState().cancelConnect();
    expect(useConnection.getState()).toMatchObject({ status: "idle", pendingSpec: null });
    expect(calls).toEqual([]);
  });

  it("confirming connects, lists tools and records how long listing took", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    const state = useConnection.getState();
    expect(calls).toEqual(["connect_stdio", "list_tools"]);
    expect(state).toMatchObject({ status: "connected", connectionId: "c1", server, tools, pendingSpec: null });
    expect(state.toolsLoadMs).toEqual(expect.any(Number));
  });

  it("a startup failure lands in the error state with stderr", async () => {
    mockServer({
      connect_stdio: () => {
        throw { kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom"] };
      },
    });
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    const state = useConnection.getState();
    expect(state.status).toBe("error");
    expect(state.error).toMatchObject({ kind: "startupFailed", stderrTail: ["boom"] });
  });

  it("if listing fails after connecting, the orphaned connection is closed", async () => {
    mockServer({
      list_tools: () => {
        throw { kind: "timeout", message: "timed out", stderrTail: [] };
      },
    });
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    expect(calls).toEqual(["connect_stdio", "list_tools", "disconnect"]);
    expect(useConnection.getState().status).toBe("error");
  });

  it("disconnect resets state and tells the backend", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    await useConnection.getState().disconnect();
    expect(calls).toContain("disconnect");
    expect(useConnection.getState()).toMatchObject({ status: "idle", connectionId: null, tools: [] });
  });

  it("a call that finds the server gone drops back to the error state", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    useConnection.getState().handleCallError(new AnvilError("disconnected", "not connected"));
    expect(useConnection.getState()).toMatchObject({ status: "error", connectionId: null });
  });

  it("ordinary tool errors keep the connection", async () => {
    mockServer();
    useConnection.getState().requestConnect(spec);
    await useConnection.getState().confirmConnect();
    useConnection.getState().handleCallError(new AnvilError("protocol", "invalid params"));
    expect(useConnection.getState().status).toBe("connected");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, because `./commandLine`, `./ipc` and `./connection` cannot be resolved.

- [ ] **Step 4: Implement**

`src/lib/commandLine.ts`:
```ts
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
```

`src/lib/ipc.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";
import type { IpcErrorPayload, ServerSummary, StdioSpec, ToolSummary } from "./types";

export class AnvilError extends Error {
  readonly kind: string;
  readonly stderrTail: string[];

  constructor(kind: string, message: string, stderrTail: string[] = []) {
    super(message);
    this.name = "AnvilError";
    this.kind = kind;
    this.stderrTail = stderrTail;
  }
}

function isPayload(value: unknown): value is IpcErrorPayload {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}

function toAnvilError(error: unknown): AnvilError {
  if (error instanceof AnvilError) return error;
  if (isPayload(error)) return new AnvilError(error.kind, error.message, error.stderrTail ?? []);
  return new AnvilError("unknown", error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAnvilError(error);
  }
}

export interface ConnectResult {
  connectionId: string;
  server: ServerSummary;
}

export const ipc = {
  connectStdio: (spec: StdioSpec, consented: boolean) => call<ConnectResult>("connect_stdio", { spec, consented }),
  listTools: (connectionId: string) => call<ToolSummary[]>("list_tools", { connectionId }),
  callTool: (connectionId: string, name: string, args: Record<string, unknown>) =>
    call<unknown>("call_tool", { connectionId, name, arguments: args }),
  disconnect: (connectionId: string) => call<null>("disconnect", { connectionId }),
};
```

`src/state/connection.ts`:
```ts
import { create } from "zustand";
import { AnvilError, ipc } from "../lib/ipc";
import type { ServerSummary, StdioSpec, ToolSummary } from "../lib/types";

export type ConnectionStatus = "idle" | "awaiting-consent" | "connecting" | "connected" | "error";

interface ConnectionData {
  status: ConnectionStatus;
  pendingSpec: StdioSpec | null;
  connectionId: string | null;
  server: ServerSummary | null;
  tools: ToolSummary[];
  toolsLoadMs: number | null;
  error: AnvilError | null;
}

interface ConnectionActions {
  requestConnect(spec: StdioSpec): void;
  cancelConnect(): void;
  confirmConnect(): Promise<void>;
  disconnect(): Promise<void>;
  handleCallError(error: AnvilError): void;
}

const initial: ConnectionData = {
  status: "idle",
  pendingSpec: null,
  connectionId: null,
  server: null,
  tools: [],
  toolsLoadMs: null,
  error: null,
};

const toAnvilError = (e: unknown) => (e instanceof AnvilError ? e : new AnvilError("unknown", String(e)));
const closeQuietly = (id: string) => void ipc.disconnect(id).catch(() => undefined);

export const useConnection = create<ConnectionData & ConnectionActions>()((set, get) => ({
  ...initial,

  requestConnect: (spec) => set({ ...initial, status: "awaiting-consent", pendingSpec: spec }),

  cancelConnect: () => set({ status: "idle", pendingSpec: null }),

  confirmConnect: async () => {
    const { pendingSpec, status } = get();
    if (!pendingSpec || status !== "awaiting-consent") return;
    set({ status: "connecting", error: null });

    let connectionId: string | null = null;
    try {
      const result = await ipc.connectStdio(pendingSpec, true);
      connectionId = result.connectionId;
      const started = performance.now();
      const tools = await ipc.listTools(connectionId);
      const toolsLoadMs = Math.round(performance.now() - started);
      if (get().status !== "connecting") {
        closeQuietly(connectionId); // The user moved on while we were connecting.
        return;
      }
      set({ status: "connected", connectionId, server: result.server, tools, toolsLoadMs, pendingSpec: null });
    } catch (e) {
      if (connectionId) closeQuietly(connectionId);
      set({ ...initial, status: "error", error: toAnvilError(e) });
    }
  },

  disconnect: async () => {
    const id = get().connectionId;
    set({ ...initial });
    if (id) await ipc.disconnect(id).catch(() => undefined);
  },

  handleCallError: (error) => {
    if (error.kind === "disconnected" || error.kind === "notFound") set({ ...initial, status: "error", error });
  },
}));

export function resetConnectionStore() {
  useConnection.setState(initial);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test` then `pnpm typecheck` then `pnpm lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(ui): add typed IPC client, command-line parsing and connection store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Schema utilities (resolve, classify, defaults, validate)

**Files:**
- Create: `src/schema/types.ts` (if not already created in Task 6), `src/schema/pointer.ts`, `src/schema/resolve.ts`, `src/schema/classify.ts`, `src/schema/defaults.ts`, `src/schema/prune.ts`, `src/schema/validate.ts`, `src/schema/number.ts`
- Test: `src/schema/resolve.test.ts`, `classify.test.ts`, `defaults.test.ts`, `prune.test.ts`, `validate.test.ts`, `number.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`: `SchemaObject`, `Schema = SchemaObject | boolean`, `FieldErrors = Record<string, string[]>` (keys are JSON Pointers, `""` = root), `asObject(schema) -> SchemaObject`.
  - `pointer.ts`: `escapePointer(token)`, `decodePointerToken(token)`, `childPath(parent, key)`.
  - `resolve.ts`: `MAX_FORM_DEPTH = 8`; `resolveRef(root, schema, seen?) -> { schema: SchemaObject; seen: ReadonlySet<string>; cyclic: boolean; unresolved?: string }`; `lookupPointer(root, ref)`.
  - `classify.ts`: `classify(schema: SchemaObject) -> Classified`, where `Classified` is `{ kind: "delegate"; inner: Schema } | { kind: "union"; branches: Schema[] } | { kind: "string"|"number"|"integer"|"boolean"|"object"|"array"|"enum"|"const"|"unknown" }`.
  - `defaults.ts`: `initialValue(root, schema, seen?, required = true, depth = 0) -> unknown`.
  - `prune.ts`: `pruneUndefined(value) -> unknown`.
  - `validate.ts`: `compileValidator(schema) -> { ok: true; validate(value) -> FieldErrors } | { ok: false; error: string }` (cached per schema object).
  - `number.ts`: `parseNumberInput(text, integer) -> { ok: true; value: number | undefined } | { ok: false; error: string }`.

- [ ] **Step 1: Write the types and pointer helpers**

`src/schema/types.ts`:
```ts
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
  items?: Schema;
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
```

`src/schema/pointer.ts`:
```ts
export function escapePointer(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function decodePointerToken(token: string): string {
  return decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~");
}

export function childPath(parent: string, key: string): string {
  return `${parent}/${escapePointer(key)}`;
}
```

- [ ] **Step 2: Write the failing tests**

`src/schema/resolve.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveRef } from "./resolve";
import type { SchemaObject } from "./types";

const root: SchemaObject = {
  $defs: {
    Address: { type: "object", title: "Address", properties: { city: { type: "string" } } },
    "a/b": { type: "string" },
    A: { $ref: "#/$defs/B" },
    B: { $ref: "#/$defs/A" },
  },
  definitions: { Legacy: { type: "integer" } },
};

describe("resolveRef", () => {
  it("resolves $defs and lets sibling keywords override the target", () => {
    const r = resolveRef(root, { $ref: "#/$defs/Address", title: "Shipping address" });
    expect(r.cyclic).toBe(false);
    expect(r.schema.type).toBe("object");
    expect(r.schema.title).toBe("Shipping address");
    expect(r.schema.$ref).toBeUndefined();
    expect([...r.seen]).toEqual(["#/$defs/Address"]);
  });

  it("resolves legacy definitions and escaped pointer tokens", () => {
    expect(resolveRef(root, { $ref: "#/definitions/Legacy" }).schema.type).toBe("integer");
    expect(resolveRef(root, { $ref: "#/$defs/a~1b" }).schema.type).toBe("string");
  });

  it("reports ref-to-ref cycles instead of looping", () => {
    expect(resolveRef(root, { $ref: "#/$defs/A" }).cyclic).toBe(true);
  });

  it("reports a ref already seen on this path as cyclic", () => {
    expect(resolveRef(root, { $ref: "#/$defs/Address" }, new Set(["#/$defs/Address"])).cyclic).toBe(true);
  });

  it("reports unresolvable and external refs", () => {
    expect(resolveRef(root, { $ref: "#/$defs/Missing" }).unresolved).toBe("#/$defs/Missing");
    expect(resolveRef(root, { $ref: "https://example.com/s.json" }).unresolved).toBe("https://example.com/s.json");
  });

  it("passes schemas without $ref through unchanged", () => {
    const s = { type: "string" };
    expect(resolveRef(root, s)).toMatchObject({ schema: s, cyclic: false });
    expect(resolveRef(root, true).schema).toEqual({});
  });
});
```

`src/schema/classify.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { classify } from "./classify";

describe("classify", () => {
  it.each([
    [{ type: "string" }, "string"],
    [{ type: "number" }, "number"],
    [{ type: "integer" }, "integer"],
    [{ type: "boolean" }, "boolean"],
    [{ type: "object" }, "object"],
    [{ type: "array", items: { type: "string" } }, "array"],
    [{ enum: ["a", "b"] }, "enum"],
    [{ const: "fixed" }, "const"],
    [{ type: ["string", "null"] }, "string"],
    [{ properties: { a: { type: "string" } } }, "object"],
    [{ items: { type: "string" } }, "array"],
    [{ type: ["string", "number"] }, "unknown"],
    [{ allOf: [{ type: "string" }] }, "unknown"],
  ])("%j is %s", (schema, kind) => {
    expect(classify(schema).kind).toBe(kind);
  });

  it("collapses Optional[X] (anyOf with null) to a delegate for X", () => {
    const c = classify({ anyOf: [{ type: "string" }, { type: "null" }], default: null });
    expect(c).toEqual({ kind: "delegate", inner: { type: "string" } });
  });

  it("keeps real unions and drops the null branch", () => {
    const a = { type: "object", properties: { id: { type: "integer" } } };
    const b = { type: "object", properties: { name: { type: "string" } } };
    expect(classify({ oneOf: [a, b, { type: "null" }] })).toEqual({ kind: "union", branches: [a, b] });
  });

  it("treats anyOf on an object with properties as a constraint, not a union", () => {
    expect(classify({ type: "object", properties: { a: {} }, anyOf: [{ required: ["a"] }] }).kind).toBe("object");
  });
});
```

`src/schema/defaults.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { initialValue } from "./defaults";
import type { SchemaObject } from "./types";

describe("initialValue", () => {
  it("initializes required fields only, using their defaults", () => {
    const schema: SchemaObject = {
      type: "object",
      properties: {
        mode: { type: "string", default: "fast" },
        limit: { type: "integer", default: 10 },
        name: { type: "string" },
        verbose: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        extra: { type: "array", items: { type: "string" } },
      },
      required: ["mode", "name", "verbose", "tags"],
    };
    expect(initialValue(schema, schema)).toStrictEqual({ mode: "fast", verbose: false, tags: [] });
  });

  it("initializes required nested objects and skips optional ones", () => {
    const schema: SchemaObject = {
      type: "object",
      $defs: { Address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
      properties: { home: { $ref: "#/$defs/Address" }, work: { $ref: "#/$defs/Address" } },
      required: ["home"],
    };
    expect(initialValue(schema, schema)).toStrictEqual({ home: {} });
  });

  it("uses const values and the first union branch", () => {
    const schema: SchemaObject = {
      type: "object",
      properties: {
        kind: { const: "search" },
        target: { anyOf: [{ type: "object", properties: {} }, { type: "string" }] },
      },
      required: ["kind", "target"],
    };
    expect(initialValue(schema, schema)).toStrictEqual({ kind: "search", target: {} });
  });

  it("terminates on recursive schemas", () => {
    const schema: SchemaObject = {
      $defs: { Node: { type: "object", properties: { child: { $ref: "#/$defs/Node" } }, required: ["child"] } },
      $ref: "#/$defs/Node",
    };
    expect(initialValue(schema, schema)).toStrictEqual({});
  });

  it("returns copies of defaults, not the schema's own objects", () => {
    const schema: SchemaObject = { type: "object", default: { a: [1] } };
    const value = initialValue(schema, schema) as { a: number[] };
    value.a.push(2);
    expect(schema.default).toEqual({ a: [1] });
  });
});
```

`src/schema/prune.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { pruneUndefined } from "./prune";

describe("pruneUndefined", () => {
  it("drops undefined keys at every depth and keeps null, false, 0 and empty strings", () => {
    expect(pruneUndefined({ a: undefined, b: null, c: { d: undefined, e: 0, f: "" }, g: false })).toStrictEqual({
      b: null,
      c: { e: 0, f: "" },
      g: false,
    });
  });

  it("turns undefined array items into null so positions are preserved", () => {
    expect(pruneUndefined([1, undefined, { x: undefined }])).toStrictEqual([1, null, {}]);
  });
});
```

`src/schema/validate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compileValidator } from "./validate";
import type { SchemaObject } from "./types";

const schema: SchemaObject = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 3 },
    count: { type: "integer", minimum: 1 },
    address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    "a/b": { type: "string" },
  },
  required: ["title", "address", "a/b"],
};

function validate(s: SchemaObject, value: unknown) {
  const v = compileValidator(s);
  if (!v.ok) throw new Error(v.error);
  return v.validate(value);
}

describe("compileValidator", () => {
  it("keys required errors at the missing child's path", () => {
    expect(validate(schema, { address: {} })).toMatchObject({
      "/title": ["Required"],
      "/address/city": ["Required"],
      "/a~1b": ["Required"],
    });
  });

  it("keys type and range errors at the instance path with a capitalized message", () => {
    const errors = validate(schema, { title: "ab", count: 0, address: { city: "Oslo" }, "a/b": "x" });
    expect(errors["/title"]?.[0]).toMatch(/^Must NOT have fewer than 3 characters/);
    expect(errors["/count"]?.[0]).toMatch(/^Must be >= 1/);
  });

  it("returns no errors for a valid value", () => {
    expect(validate(schema, { title: "abc", address: { city: "Oslo" }, "a/b": "x" })).toEqual({});
  });

  it("accepts draft-07 schemas by ignoring $schema", () => {
    const draft7 = { $schema: "http://json-schema.org/draft-07/schema#", type: "object", required: ["q"] };
    expect(validate(draft7, {})).toEqual({ "/q": ["Required"] });
  });

  it("reports schemas it cannot compile instead of throwing", () => {
    const v = compileValidator({ type: "object", properties: { a: { type: 12 as unknown as string } } });
    expect(v.ok).toBe(false);
  });

  it("caches the compiled validator per schema object", () => {
    expect(compileValidator(schema)).toBe(compileValidator(schema));
  });
});
```

`src/schema/number.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseNumberInput } from "./number";

describe("parseNumberInput", () => {
  it.each([
    ["", false, { ok: true, value: undefined }],
    ["  ", false, { ok: true, value: undefined }],
    ["42", true, { ok: true, value: 42 }],
    ["-1.5", false, { ok: true, value: -1.5 }],
    ["1e3", true, { ok: true, value: 1000 }],
    ["abc", false, { ok: false, error: "Enter a number" }],
    ["1,5", false, { ok: false, error: "Enter a number" }],
    ["1.5", true, { ok: false, error: "Enter a whole number" }],
    ["Infinity", false, { ok: false, error: "Enter a number" }],
  ])("%j (integer=%s)", (text, integer, expected) => {
    expect(parseNumberInput(text, integer)).toEqual(expected);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test src/schema`
Expected: FAIL, because the modules under test do not exist.

- [ ] **Step 4: Implement**

`src/schema/resolve.ts`:
```ts
import { decodePointerToken } from "./pointer";
import { asObject, type Schema, type SchemaObject } from "./types";

/** Nesting beyond this renders as raw JSON. It guards against pathological schemas. */
export const MAX_FORM_DEPTH = 8;
const MAX_REF_HOPS = 32;

export interface Resolved {
  schema: SchemaObject;
  seen: ReadonlySet<string>;
  cyclic: boolean;
  unresolved?: string;
}

/** Looks up a same-document JSON Pointer ref ("#", "#/$defs/X"). Anchors and external refs return undefined. */
export function lookupPointer(root: SchemaObject, ref: string): Schema | undefined {
  if (!ref.startsWith("#")) return undefined;
  const pointer = ref.slice(1);
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let node: unknown = root;
  for (const token of pointer.slice(1).split("/")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[decodePointerToken(token)];
  }
  if (typeof node === "boolean") return node;
  return node !== null && typeof node === "object" ? (node as SchemaObject) : undefined;
}

/**
 * Follows $ref chains. `seen` holds the refs already expanded on this path from the root; meeting one again means
 * the schema is recursive, and the caller should stop expanding.
 */
export function resolveRef(root: SchemaObject, schema: Schema, seen: ReadonlySet<string> = new Set()): Resolved {
  let current = asObject(schema);
  const nextSeen = new Set(seen);
  let hops = 0;
  while (typeof current.$ref === "string") {
    const ref = current.$ref;
    if (nextSeen.has(ref) || hops++ >= MAX_REF_HOPS) return { schema: current, seen: nextSeen, cyclic: true };
    nextSeen.add(ref);
    const siblings: SchemaObject = { ...current };
    delete siblings.$ref;
    const target = lookupPointer(root, ref);
    if (target === undefined) return { schema: siblings, seen: nextSeen, cyclic: false, unresolved: ref };
    current = { ...asObject(target), ...siblings };
  }
  return { schema: current, seen: nextSeen, cyclic: false };
}
```

`src/schema/classify.ts`:
```ts
import type { Schema, SchemaObject } from "./types";

type SimpleKind = "string" | "number" | "integer" | "boolean" | "object" | "array" | "enum" | "const" | "unknown";

export type Classified =
  | { kind: "delegate"; inner: Schema }
  | { kind: "union"; branches: Schema[] }
  | { kind: SimpleKind };

const TYPE_KINDS = new Set(["string", "number", "integer", "boolean", "object", "array"]);

function isNullSchema(schema: Schema): boolean {
  if (typeof schema !== "object") return false;
  if (schema.type === "null") return true;
  return Array.isArray(schema.type) && schema.type.length === 1 && schema.type[0] === "null";
}

/** Decides which widget a (ref-resolved) schema gets. Structural only: never resolves $ref itself. */
export function classify(schema: SchemaObject): Classified {
  if ("const" in schema) return { kind: "const" };
  if (Array.isArray(schema.enum)) return { kind: "enum" };

  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union) && schema.type === undefined && schema.properties === undefined) {
    const nonNull = union.filter((branch) => !isNullSchema(branch));
    if (nonNull.length === 0) return { kind: "unknown" };
    // Optional[X] from pydantic/zod, or a single-branch anyOf: render X.
    if (nonNull.length === 1) return { kind: "delegate", inner: nonNull[0]! };
    return { kind: "union", branches: nonNull };
  }

  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const nonNullTypes = types.filter((t) => t !== "null");
  if (nonNullTypes.length === 1) {
    const type = nonNullTypes[0]!;
    return TYPE_KINDS.has(type) ? { kind: type as SimpleKind } : { kind: "unknown" };
  }
  if (types.length === 0) {
    if (schema.properties) return { kind: "object" };
    if (schema.items) return { kind: "array" };
  }
  return { kind: "unknown" };
}
```

`src/schema/defaults.ts`:
```ts
import { classify } from "./classify";
import { MAX_FORM_DEPTH, resolveRef } from "./resolve";
import type { Schema, SchemaObject } from "./types";

const cloneJson = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * The starting value for a form. Only required fields are filled in (from their default where one exists), so
 * we send what the user set and what the schema demands, and never invent values for optional fields.
 */
export function initialValue(
  root: SchemaObject,
  schema: Schema,
  seen: ReadonlySet<string> = new Set(),
  required = true,
  depth = 0,
): unknown {
  const resolved = resolveRef(root, schema, seen);
  if (resolved.cyclic || resolved.unresolved || depth > MAX_FORM_DEPTH) return undefined;
  const s = resolved.schema;
  if (s.default !== undefined) return cloneJson(s.default);

  const c = classify(s);
  switch (c.kind) {
    case "const":
      return cloneJson(s.const);
    case "union":
      return initialValue(root, c.branches[0]!, resolved.seen, required, depth + 1);
    case "boolean":
      return required ? false : undefined;
    case "array":
      return required ? [] : undefined;
    case "object": {
      if (!required) return undefined;
      const out: Record<string, unknown> = {};
      const requiredKeys = new Set(s.required ?? []);
      for (const [key, prop] of Object.entries(s.properties ?? {})) {
        if (!requiredKeys.has(key)) continue;
        const value = initialValue(root, prop, resolved.seen, true, depth + 1);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    default:
      return undefined;
  }
}
```

`src/schema/prune.ts`:
```ts
/** Removes undefined object keys (fields the user left blank) at every depth, ready to send as JSON. */
export function pruneUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : pruneUndefined(item)));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = pruneUndefined(item);
    }
    return out;
  }
  return value;
}
```

`src/schema/validate.ts`:
```ts
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { childPath } from "./pointer";
import type { FieldErrors, Schema, SchemaObject } from "./types";

export type Validator = { ok: true; validate: (value: unknown) => FieldErrors } | { ok: false; error: string };

const cache = new WeakMap<object, Validator>();
const ACCEPT_ALL: Validator = { ok: true, validate: () => ({}) };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function toFieldErrors(errors: ErrorObject[]): FieldErrors {
  const out: FieldErrors = {};
  for (const error of errors) {
    // Summary errors for unions repeat what the branch errors already say.
    if (error.keyword === "anyOf" || error.keyword === "oneOf") continue;
    const missing = error.keyword === "required" ? (error.params as { missingProperty: string }).missingProperty : null;
    const path = missing === null ? error.instancePath : childPath(error.instancePath, missing);
    const message = missing === null ? capitalize(error.message ?? "invalid value") : "Required";
    (out[path] ??= []).push(message);
  }
  return out;
}

/** Compiles a tool's input schema with Ajv (JSON Schema 2020-12). Never throws: bad schemas report `ok: false`. */
export function compileValidator(schema: Schema): Validator {
  if (typeof schema === "boolean") return ACCEPT_ALL;
  const hit = cache.get(schema);
  if (hit) return hit;

  let validator: Validator;
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    // Servers often declare draft-07 via $schema (zod-to-json-schema). Ajv2020 would reject that meta-schema, and
    // the keywords we render are compatible, so validate everything as 2020-12.
    const copy: SchemaObject = { ...schema };
    delete copy.$schema;
    const validate = ajv.compile(copy);
    validator = {
      ok: true,
      validate: (value) => {
        validate(value);
        return toFieldErrors(validate.errors ?? []);
      },
    };
  } catch (e) {
    validator = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(schema, validator);
  return validator;
}
```

`src/schema/number.ts`:
```ts
export type NumberParse = { ok: true; value: number | undefined } | { ok: false; error: string };

export function parseNumberInput(text: string, integer: boolean): NumberParse {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a number" };
  if (integer && !Number.isInteger(value)) return { ok: false, error: "Enter a whole number" };
  return { ok: true, value };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test` then `pnpm typecheck` then `pnpm lint`
Expected: all pass. If the Ajv range message differs in wording (for example `must be >= 1`), keep the implementation and adjust only the regex in the test to match Ajv's actual message.

- [ ] **Step 6: Commit**

```bash
git add src/schema
git commit -m "feat(ui): add JSON Schema resolution, classification, defaults and Ajv 2020 validation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `SchemaForm` component

**Files:**
- Create: `src/components/schema-form/context.ts`, `Field.tsx`, `CompositeFields.tsx`, `SchemaForm.tsx`, `schema-form.css`
- Test: `src/components/schema-form/SchemaForm.test.tsx`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces: `SchemaForm` with props `{ schema: Schema; value: unknown; onChange(value: unknown): void; onSubmit(value: unknown): void; submitLabel?: string; busy?: boolean }`. `onSubmit` receives the pruned value and fires only when the value is valid. The CSS classes `sf-input`, `sf-label`, `sf-help`, `sf-error`, `sf-button`, `sf-button-primary`, `sf-button-quiet`, `sf-code` are reused by Task 9.

- [ ] **Step 1: Write the failing tests**

`src/components/schema-form/SchemaForm.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { initialValue } from "../../schema/defaults";
import { asObject, type Schema, type SchemaObject } from "../../schema/types";
import { SchemaForm } from "./SchemaForm";

function Harness({ schema, onSubmit }: { schema: Schema; onSubmit: (value: unknown) => void }) {
  const [value, setValue] = useState<unknown>(() => initialValue(asObject(schema), schema));
  return <SchemaForm schema={schema} value={value} onChange={setValue} onSubmit={onSubmit} />;
}

function setup(schema: Schema) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<Harness schema={schema} onSubmit={onSubmit} />);
  return { onSubmit, user };
}

const ticket: SchemaObject = {
  type: "object",
  $defs: {
    Address: {
      type: "object",
      title: "Address",
      properties: { city: { type: "string", title: "City" }, zip: { type: "string" } },
      required: ["city"],
    },
  },
  properties: {
    title: { type: "string", description: "Short summary" },
    priority: { enum: ["low", "high"] },
    count: { type: "integer", minimum: 1 },
    urgent: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
    address: { $ref: "#/$defs/Address" },
    note: { anyOf: [{ type: "string" }, { type: "null" }], default: null, title: "Note" },
  },
  required: ["title", "priority", "address"],
};

describe("SchemaForm", () => {
  it("renders every field kind, including $ref targets and Optional[str]", () => {
    setup(ticket);
    expect(screen.getByLabelText(/^title/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/^priority/)).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText(/^count/)).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText(/^urgent/)).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole("button", { name: "Add tags item" })).toBeInTheDocument();
    const address = screen.getByRole("group", { name: /Address/ });
    expect(within(address).getByLabelText(/^City/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Note/)).toHaveAttribute("type", "text");
  });

  it("blocks submit, shows inline errors and focuses the first invalid field", async () => {
    const { onSubmit, user } = setup(ticket);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Required")).toHaveLength(3);
    expect(screen.getByRole("alert")).toHaveTextContent("Fix the highlighted fields before running.");
    expect(screen.getByLabelText(/^title/)).toHaveFocus();
  });

  it("submits only what the user set", async () => {
    const { onSubmit, user } = setup(ticket);
    await user.type(screen.getByLabelText(/^title/), "Printer on fire");
    await user.selectOptions(screen.getByLabelText(/^priority/), "high");
    await user.type(screen.getByLabelText(/^City/), "Oslo");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({ title: "Printer on fire", priority: "high", address: { city: "Oslo" } });
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      title: "Printer on fire",
      priority: "high",
      address: { city: "Oslo" },
    });
  });

  it("rejects non-numeric and fractional input in integer fields", async () => {
    const { onSubmit, user } = setup(ticket);
    await user.type(screen.getByLabelText(/^title/), "T");
    await user.selectOptions(screen.getByLabelText(/^priority/), "low");
    await user.type(screen.getByLabelText(/^City/), "Oslo");
    const count = screen.getByLabelText(/^count/);

    await user.type(count, "abc");
    expect(screen.getByText("Enter a number")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(count);
    await user.type(count, "1.5");
    expect(screen.getByText("Enter a whole number")).toBeInTheDocument();

    await user.clear(count);
    await user.type(count, "3");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
  });

  it("adds and removes array items", async () => {
    const { onSubmit, user } = setup({ type: "object", properties: { tags: { type: "array", items: { type: "string" } } } });
    await user.click(screen.getByRole("button", { name: "Add tags item" }));
    await user.type(screen.getByLabelText(/^Item 1/), "a");
    await user.click(screen.getByRole("button", { name: "Add tags item" }));
    await user.type(screen.getByLabelText(/^Item 2/), "b");
    await user.click(screen.getByRole("button", { name: "Remove tags item 1" }));
    expect(screen.getByLabelText(/^Item 1/)).toHaveValue("b");
    expect(screen.queryByLabelText(/^Item 2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({ tags: ["b"] });
  });

  it("switches anyOf variants", async () => {
    const { onSubmit, user } = setup({
      type: "object",
      properties: {
        target: {
          anyOf: [
            { title: "By id", type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
            { title: "By name", type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          ],
        },
      },
      required: ["target"],
    });
    expect(screen.getByLabelText(/^id/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Variant"), "By name");
    expect(screen.queryByLabelText(/^id/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name/), "alice");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({ target: { name: "alice" } });
  });

  it("round-trips through the raw JSON view", async () => {
    const { user } = setup(ticket);
    await user.type(screen.getByLabelText(/^title/), "Printer");
    await user.selectOptions(screen.getByLabelText(/^priority/), "low");
    await user.type(screen.getByLabelText(/^City/), "Oslo");

    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    const raw = screen.getByLabelText("Arguments (JSON)");
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toStrictEqual({
      title: "Printer",
      priority: "low",
      address: { city: "Oslo" },
    });

    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByLabelText(/^title/)).toHaveValue("Printer");

    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    await user.clear(screen.getByLabelText("Arguments (JSON)"));
    await user.click(screen.getByLabelText("Arguments (JSON)"));
    await user.paste('{"title":"Changed","priority":"high","address":{"city":"Bergen"}}');
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByLabelText(/^title/)).toHaveValue("Changed");
    expect(screen.getByLabelText(/^City/)).toHaveValue("Bergen");
  });

  it("refuses to leave raw JSON while it is invalid", async () => {
    const { user } = setup(ticket);
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    await user.clear(screen.getByLabelText("Arguments (JSON)"));
    await user.click(screen.getByLabelText("Arguments (JSON)"));
    await user.paste("{");
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByLabelText("Arguments (JSON)")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid JSON/);
  });

  it("renders recursive schemas without hanging, switching to JSON at the cycle", async () => {
    const { user } = setup({
      type: "object",
      $defs: {
        Node: {
          type: "object",
          properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/Node" } } },
        },
      },
      properties: { tree: { $ref: "#/$defs/Node" } },
    });
    expect(screen.getByLabelText(/^name/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add children item" }));
    expect(screen.getByText(/recursive/i)).toBeInTheDocument();
  });

  it("validates draft-07 schemas", async () => {
    const { onSubmit, user } = setup({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    expect(screen.queryByText(/could not be compiled/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("falls back to raw JSON with a warning when the schema cannot be compiled", () => {
    setup({ type: "object", properties: { a: { type: 12 as unknown as string } } });
    expect(screen.getByText(/could not be compiled/)).toBeInTheDocument();
    expect(screen.getByLabelText("Arguments (JSON)")).toBeInTheDocument();
  });

  it("handles tools that take no arguments", async () => {
    const { onSubmit, user } = setup({ type: "object" });
    expect(screen.getByText(/declares no arguments/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/components/schema-form`
Expected: FAIL, because `./SchemaForm` cannot be resolved.

- [ ] **Step 3: Implement the context**

`src/components/schema-form/context.ts`:
```ts
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
```

- [ ] **Step 4: Implement the fields**

`src/components/schema-form/Field.tsx`:
```tsx
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
  const emptyLabel = required ? "Choose…" : s.default !== undefined ? `— default: ${JSON.stringify(s.default)} —` : "— not set —";
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
```

`src/components/schema-form/CompositeFields.tsx`:
```tsx
import { useEffect, useId, useState } from "react";
import { classify } from "../../schema/classify";
import { initialValue } from "../../schema/defaults";
import { childPath } from "../../schema/pointer";
import { resolveRef } from "../../schema/resolve";
import { asObject, type Schema, type SchemaObject } from "../../schema/types";
import { describedBy, useFieldError, useFormContext, type FieldProps } from "./context";
import { Field, FieldShell } from "./Field";

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

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
        onChange(updated);
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
```

- [ ] **Step 5: Implement `SchemaForm`**

`src/components/schema-form/SchemaForm.tsx`:
```tsx
import { Component, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
          This input schema could not be compiled, so validation is off. You can still send raw JSON. ({validator.error})
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
            <Field schema={schema} path="" label="Arguments" required value={value} onChange={onChange} depth={0} seen={new Set()} />
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
```

`src/components/schema-form/schema-form.css`:
```css
.sf {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sf-root,
.sf-fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sf-fieldset {
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.sf-legend {
  padding: 0 var(--space-1);
  font-weight: 600;
}

.sf-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sf-check {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-2);
}

.sf-check .sf-help,
.sf-check .sf-error {
  flex-basis: 100%;
}

.sf-label {
  font-size: var(--text-sm);
  font-weight: 600;
}

.sf-required {
  color: var(--color-danger);
}

.sf-help {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  white-space: pre-wrap;
}

.sf-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.sf-input[aria-invalid="true"] {
  border-color: var(--color-danger);
  border-width: 2px;
}

.sf-code {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.sf-error {
  font-size: var(--text-sm);
  color: var(--color-danger);
}

/* Errors are also marked with a symbol, not only color. */
.sf-error::before {
  content: "✕ ";
}

.sf-warning {
  padding: var(--space-3);
  font-size: var(--text-sm);
  background: var(--color-danger-surface);
  border-radius: var(--radius-sm);
}

.sf-toolbar,
.sf-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sf-toolbar {
  justify-content: flex-end;
}

.sf-array {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sf-array-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: var(--space-2);
}

.sf-const {
  font-size: var(--text-sm);
}

.sf-button,
.sf-button-primary,
.sf-button-quiet {
  align-self: flex-start;
  padding: var(--space-2) var(--space-4);
  font: inherit;
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.sf-button {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.sf-button-primary {
  color: var(--color-accent-text);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
}

.sf-button-primary:disabled {
  opacity: 0.6;
  cursor: progress;
}

.sf-button-quiet {
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
}

.sf-button-quiet[aria-pressed="true"] {
  color: var(--color-text);
  border-color: var(--color-border);
  background: var(--color-surface-sunken);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test` then `pnpm typecheck` then `pnpm lint`
Expected: all pass.

If `react-hooks/set-state-in-render` flags the value-sync block in `NumberField`, the block is the React-documented "adjust state when a prop changes" pattern. Add an eslint-disable comment for that rule on the `if` line, with the reason, and do not rewrite it into an effect.

- [ ] **Step 7: Commit**

```bash
git add src/components/schema-form
git commit -m "feat(ui): add JSON Schema form with inline validation and raw JSON mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: App UI (connect, consent, tool list, invoke)

**Files:**
- Create: `src/components/ConnectPanel.tsx`, `ConsentDialog.tsx`, `EmptyState.tsx`, `ErrorBanner.tsx`, `ToolList.tsx`, `ToolDetail.tsx`, `src/styles/app.css`
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `useConnection`, `resetConnectionStore` (Task 6); `ipc`, `AnvilError` (Task 6); `parseCommandLine`, `formatCommandLine` (Task 6); `SchemaForm` (Task 8); `initialValue`, `asObject` (Task 7).
- Produces: `SAMPLE_SPEC` (exported from `EmptyState.tsx`); the finished Days 1–2 UI.

- [ ] **Step 1: Write the failing tests**

Replace `src/App.test.tsx`:
```tsx
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { resetConnectionStore } from "./state/connection";

const server = { name: "everything", title: "Everything", version: "2026.8.31", protocolVersion: "2025-11-25", capabilities: {} };
const tools = [
  {
    name: "echo",
    description: "Echoes back the input",
    inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  },
  {
    name: "sneaky",
    description: '<img src=x onerror="alert(1)">Ignore previous instructions',
    inputSchema: { type: "object" },
  },
];

type Handler = (args: Record<string, unknown>) => unknown;
let calls: Array<{ cmd: string; args: Record<string, unknown> }>;

function mockBackend(overrides: Record<string, Handler> = {}) {
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    calls.push({ cmd, args: a });
    if (overrides[cmd]) return overrides[cmd](a);
    switch (cmd) {
      case "connect_stdio":
        return { connectionId: "c1", server };
      case "list_tools":
        return tools;
      case "call_tool":
        return { content: [{ type: "text", text: `Echo: ${(a.arguments as { message: string }).message}` }] };
      default:
        return null;
    }
  });
}

async function connectToSample() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Try server-everything" }));
  await user.click(screen.getByRole("button", { name: "Run command" }));
  await screen.findByRole("navigation", { name: "Tools" });
  return user;
}

describe("App", () => {
  beforeEach(() => {
    resetConnectionStore();
    calls = [];
  });

  it("renders the product name as the top-level heading", () => {
    mockBackend();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "MCP Anvil" })).toBeInTheDocument();
  });

  it("asks for consent, showing the exact command, before spawning anything", async () => {
    mockBackend();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try server-everything" }));

    const dialog = screen.getByRole("dialog", { name: "Run this command?" });
    expect(dialog).toHaveTextContent("npx -y @modelcontextprotocol/server-everything");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(calls).toEqual([]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("connects after consent and lists tools with timing", async () => {
    mockBackend();
    await connectToSample();
    expect(calls[0]).toEqual({
      cmd: "connect_stdio",
      args: expect.objectContaining({
        spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], env: {}, cwd: null },
        consented: true,
      }),
    });
    expect(screen.getByRole("button", { name: /^echo/ })).toBeInTheDocument();
    expect(screen.getByText(/Connected to Everything 2026\.8\.31 · 2 tools · listed in \d+ ms/)).toBeInTheDocument();
  });

  it("parses a typed command line into the spec", async () => {
    mockBackend();
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Command (stdio)"), 'node "C:\\my servers\\s.js" --verbose');
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("dialog")).toHaveTextContent('node "C:\\my servers\\s.js" --verbose');
  });

  it("invokes a tool from its form and shows the result", async () => {
    mockBackend();
    const user = await connectToSample();
    await user.click(screen.getByRole("button", { name: /^echo/ }));
    expect(screen.getByRole("heading", { level: 2, name: "echo" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^message/), "hi");
    await user.click(screen.getByRole("button", { name: "Run tool" }));

    expect(await screen.findByText(/✓ Success · \d+ ms/)).toBeInTheDocument();
    expect(screen.getByText(/"text": "Echo: hi"/)).toBeInTheDocument();
    expect(calls).toContainEqual({
      cmd: "call_tool",
      args: expect.objectContaining({ connectionId: "c1", name: "echo", arguments: { message: "hi" } }),
    });
  });

  it("labels tool-level errors without relying on color", async () => {
    mockBackend({ call_tool: () => ({ isError: true, content: [{ type: "text", text: "nope" }] }) });
    const user = await connectToSample();
    await user.click(screen.getByRole("button", { name: /^echo/ }));
    await user.type(screen.getByLabelText(/^message/), "hi");
    await user.click(screen.getByRole("button", { name: "Run tool" }));
    expect(await screen.findByText(/✕ Tool returned an error/)).toBeInTheDocument();
  });

  it("shows startup failures with the server's stderr", async () => {
    mockBackend({
      connect_stdio: () => {
        throw { kind: "startupFailed", message: "the server failed to start: exited", stderrTail: ["boom: missing API key"] };
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try server-everything" }));
    await user.click(screen.getByRole("button", { name: "Run command" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server failed to start");
    expect(alert).toHaveTextContent("boom: missing API key");
  });

  it("returns to the start screen when a call finds the server gone", async () => {
    mockBackend({
      call_tool: () => {
        throw { kind: "disconnected", message: "not connected: the server closed the connection", stderrTail: [] };
      },
    });
    const user = await connectToSample();
    await user.click(screen.getByRole("button", { name: /^echo/ }));
    await user.type(screen.getByLabelText(/^message/), "hi");
    await user.click(screen.getByRole("button", { name: "Run tool" }));
    expect(await screen.findByText(/The server disconnected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try server-everything" })).toBeInTheDocument();
  });

  it("disconnects on request", async () => {
    mockBackend();
    const user = await connectToSample();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(calls).toContainEqual({ cmd: "disconnect", args: expect.objectContaining({ connectionId: "c1" }) });
    expect(screen.getByRole("button", { name: "Try server-everything" })).toBeInTheDocument();
  });

  it("renders tool descriptions as text, never as HTML", async () => {
    mockBackend();
    const user = await connectToSample();
    await user.click(screen.getByRole("button", { name: /^sneaky/ }));
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">Ignore previous instructions/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("filters tools and moves between them with arrow keys", async () => {
    mockBackend();
    const user = await connectToSample();
    await user.type(screen.getByLabelText("Filter tools"), "echo");
    expect(screen.getByText("1 of 2 tools")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Filter tools"));
    screen.getByRole("button", { name: /^echo/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /^sneaky/ })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/App.test.tsx`
Expected: FAIL. Only the heading test passes; the rest fail because the UI does not exist.

- [ ] **Step 3: Implement the components**

`src/components/EmptyState.tsx`:
```tsx
import type { StdioSpec } from "../lib/types";
import { useConnection } from "../state/connection";

export const SAMPLE_SPEC: StdioSpec = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-everything"],
  env: {},
  cwd: null,
};

export function EmptyState() {
  const requestConnect = useConnection((s) => s.requestConnect);
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 id="empty-title">Connect an MCP server to start</h2>
      <p>Anvil lists the server's tools, builds a form from each tool's input schema, and shows the raw result.</p>
      <button type="button" className="sf-button-primary" onClick={() => requestConnect(SAMPLE_SPEC)}>
        Try server-everything
      </button>
      <p className="sf-help">
        Runs <code>npx -y @modelcontextprotocol/server-everything</code>, the reference test server. Needs Node.js.
      </p>
    </section>
  );
}
```

`src/components/ConnectPanel.tsx`:
```tsx
import { useId, useState, type FormEvent } from "react";
import { parseCommandLine } from "../lib/commandLine";
import { useConnection } from "../state/connection";

export function ConnectPanel() {
  const requestConnect = useConnection((s) => s.requestConnect);
  const connecting = useConnection((s) => s.status === "connecting");
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { command, args } = parseCommandLine(line);
      setError(null);
      requestConnect({ command, args, env: {}, cwd: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className="connect" onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">
        Connect a server
      </h2>
      <div className="sf-field">
        <label htmlFor={id} className="sf-label">
          Command (stdio)
        </label>
        <input
          id={id}
          className="sf-input sf-code"
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder="npx -y @modelcontextprotocol/server-everything"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
        />
        <p id={`${id}-help`} className="sf-help">
          Runs locally over stdio. You confirm before anything starts.
        </p>
        {error && (
          <p id={`${id}-error`} className="sf-error">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="sf-button-primary" disabled={connecting}>
        {connecting ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
```

`src/components/ConsentDialog.tsx`:
```tsx
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
```

`src/components/ErrorBanner.tsx`:
```tsx
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
```

`src/components/ToolList.tsx`:
```tsx
import { useRef, useState, type KeyboardEvent } from "react";
import { useConnection } from "../state/connection";

export function ToolList({ selected, onSelect }: { selected: string | null; onSelect: (name: string) => void }) {
  const tools = useConnection((s) => s.tools);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const q = query.trim().toLowerCase();
  const visible = q
    ? tools.filter((t) => [t.name, t.title ?? "", t.description ?? ""].some((field) => field.toLowerCase().includes(q)))
    : tools;

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const target = buttons[Math.max(0, Math.min(buttons.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)))];
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }

  return (
    <nav className="tool-list" aria-label="Tools">
      <label htmlFor="tool-filter" className="visually-hidden">
        Filter tools
      </label>
      <input
        id="tool-filter"
        type="search"
        className="sf-input"
        placeholder="Filter tools"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="sf-help" aria-live="polite">
        {visible.length} of {tools.length} tools
      </p>
      <ul ref={listRef} className="tool-items" onKeyDown={onKeyDown}>
        {visible.map((tool, i) => (
          <li key={`${i}:${tool.name}`}>
            <button
              type="button"
              className="tool-item"
              aria-current={tool.name === selected ? "true" : undefined}
              onClick={() => onSelect(tool.name)}
            >
              <span className="tool-name">{tool.title ?? tool.name}</span>
              {tool.title && <span className="tool-id">{tool.name}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`src/components/ToolDetail.tsx`:
```tsx
import { useState } from "react";
import { AnvilError, ipc } from "../lib/ipc";
import type { ToolSummary } from "../lib/types";
import { initialValue } from "../schema/defaults";
import { asObject } from "../schema/types";
import { useConnection } from "../state/connection";
import { SchemaForm } from "./schema-form/SchemaForm";

type RunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; result: unknown; ms: number }
  | { state: "failed"; error: AnvilError };

function isToolError(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { isError?: unknown }).isError === true;
}

/** Shows one tool. Keyed by tool name in App, so switching tools resets the form and the result. */
export function ToolDetail({ tool }: { tool: ToolSummary }) {
  const connectionId = useConnection((s) => s.connectionId);
  const handleCallError = useConnection((s) => s.handleCallError);
  const [args, setArgs] = useState<unknown>(() => initialValue(asObject(tool.inputSchema), tool.inputSchema));
  const [run, setRun] = useState<RunState>({ state: "idle" });

  async function invokeTool(value: unknown) {
    if (!connectionId) return;
    setRun({ state: "running" });
    const started = performance.now();
    try {
      const result = await ipc.callTool(connectionId, tool.name, (value ?? {}) as Record<string, unknown>);
      setRun({ state: "done", result, ms: Math.round(performance.now() - started) });
    } catch (e) {
      const error = e instanceof AnvilError ? e : new AnvilError("unknown", String(e));
      setRun({ state: "failed", error });
      handleCallError(error);
    }
  }

  const toolError = run.state === "done" && isToolError(run.result);
  return (
    <article className="tool-detail" aria-labelledby="tool-title">
      <header className="tool-header">
        <h2 id="tool-title">{tool.title ?? tool.name}</h2>
        {tool.title && <code className="tool-id">{tool.name}</code>}
        {tool.description && <p className="tool-description">{tool.description}</p>}
      </header>

      <SchemaForm
        schema={tool.inputSchema}
        value={args}
        onChange={setArgs}
        onSubmit={(value) => void invokeTool(value)}
        submitLabel="Run tool"
        busy={run.state === "running"}
      />

      <section className="result" aria-labelledby="result-title" aria-live="polite">
        <h3 id="result-title">Result</h3>
        {run.state === "idle" && <p className="sf-help">Run the tool to see its response.</p>}
        {run.state === "running" && <div className="skeleton" role="status" aria-label="Running tool" />}
        {run.state === "done" && (
          <>
            <p className={toolError ? "result-status result-status-error" : "result-status result-status-ok"}>
              {toolError ? "✕ Tool returned an error" : "✓ Success"} · {run.ms} ms
            </p>
            <pre className="code-block">{JSON.stringify(run.result, null, 2)}</pre>
          </>
        )}
        {run.state === "failed" && (
          <p className="sf-error" role="alert">
            {run.error.message}
          </p>
        )}
      </section>
    </article>
  );
}
```

`src/App.tsx`:
```tsx
import { useState } from "react";
import { ConnectPanel } from "./components/ConnectPanel";
import { ConsentDialog } from "./components/ConsentDialog";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { ToolDetail } from "./components/ToolDetail";
import { ToolList } from "./components/ToolList";
import { useConnection } from "./state/connection";
import "./styles/app.css";

export default function App() {
  const status = useConnection((s) => s.status);
  const server = useConnection((s) => s.server);
  const tools = useConnection((s) => s.tools);
  const toolsLoadMs = useConnection((s) => s.toolsLoadMs);
  const error = useConnection((s) => s.error);
  const disconnect = useConnection((s) => s.disconnect);
  const [selected, setSelected] = useState<string | null>(null);

  const connected = status === "connected" && server !== null;
  const tool = connected ? (tools.find((t) => t.name === selected) ?? null) : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">MCP Anvil</h1>
        <p className="app-status" role="status" aria-live="polite">
          {connected
            ? `● Connected to ${server.title ?? server.name} ${server.version} · ${tools.length} tools · listed in ${toolsLoadMs} ms`
            : status === "connecting"
              ? "◌ Connecting…"
              : "○ Not connected"}
        </p>
        {connected && (
          <button
            type="button"
            className="sf-button"
            onClick={() => {
              setSelected(null);
              void disconnect();
            }}
          >
            Disconnect
          </button>
        )}
      </header>
      <aside className="app-sidebar">{connected ? <ToolList selected={selected} onSelect={setSelected} /> : <ConnectPanel />}</aside>
      <main className="app-main">
        {error && <ErrorBanner error={error} />}
        {tool ? (
          <ToolDetail key={tool.name} tool={tool} />
        ) : connected ? (
          <p className="sf-help">Select a tool to inspect and run it.</p>
        ) : (
          <EmptyState />
        )}
      </main>
      <ConsentDialog />
    </div>
  );
}
```

`src/styles/app.css`:
```css
.app {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "header header"
    "sidebar main";
  height: 100%;
}

.app-header {
  grid-area: header;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.app-title {
  font-size: var(--text-lg);
}

.app-status {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.app-sidebar {
  grid-area: sidebar;
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.app-main {
  grid-area: main;
  overflow-y: auto;
  padding: var(--space-6) var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.panel-title {
  font-size: var(--text-md);
  margin-bottom: var(--space-3);
}

.connect {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.empty {
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.empty h2 {
  font-size: var(--text-xl);
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tool-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tool-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--space-2) var(--space-3);
  font: inherit;
  text-align: left;
  color: var(--color-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.tool-item:hover {
  background: var(--color-surface-sunken);
}

/* Selected state is shown by border and weight as well as color. */
.tool-item[aria-current="true"] {
  font-weight: 600;
  background: var(--color-surface-sunken);
  border-color: var(--color-border);
  border-left: 3px solid var(--color-accent);
}

.tool-name {
  overflow-wrap: anywhere;
}

.tool-id {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.tool-detail {
  max-width: 880px;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.tool-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tool-header h2 {
  font-size: var(--text-xl);
}

.tool-description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.result {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.result h3 {
  font-size: var(--text-md);
}

.result-status-ok {
  color: var(--color-success);
  font-weight: 600;
}

.result-status-error {
  color: var(--color-danger);
  font-weight: 600;
}

.code-block {
  margin: 0;
  padding: var(--space-3);
  font-size: var(--text-sm);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: auto;
  max-height: 480px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.skeleton {
  height: 96px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-surface-sunken), var(--color-border), var(--color-surface-sunken));
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s var(--ease-out) infinite;
}

@keyframes skeleton-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}

.error-banner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-danger-surface);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
}

.error-title {
  font-weight: 600;
  color: var(--color-danger);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 0.45);
}

.modal {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.modal h2 {
  font-size: var(--text-lg);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test` then `pnpm typecheck` then `pnpm lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): connect with consent, browse tools and invoke them from schema forms" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: CI workflow, README and end-to-end smoke

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: every script and test from Tasks 1–9.
- Produces: CI that runs the whole suite on Linux, macOS and Windows; a README that tells contributors how to run it.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-22.04, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5

      - name: Install Linux system dependencies
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      # tauri::generate_context!() needs dist/ at compile time.
      - run: pnpm build
      - run: cargo fmt --all -- --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: cargo test --workspace

  audit:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v5
      - uses: taiki-e/install-action@v2
        with:
          tool: cargo-audit
      - run: cargo audit
```

- [ ] **Step 2: Write the README**

`README.md`:
```markdown
# MCP Anvil

A free, open-source desktop workbench for the Model Context Protocol. Connect to an MCP server, inspect its tools,
fill in forms generated from their JSON Schemas, and see exactly what comes back.

Status: early development. Stdio servers, tool listing and invocation work today. See `docs/SPEC.md` for the roadmap.

Privacy: no telemetry, ever. Anvil talks only to the servers you connect and, later, to the LLM endpoint you configure.

## Develop

Prerequisites: Rust (stable, 1.88+), Node 24, pnpm 10, and the Tauri system dependencies for your OS
(https://tauri.app/start/prerequisites/).

    pnpm install
    pnpm tauri dev

Checks:

    pnpm test && pnpm typecheck && pnpm lint
    pnpm build && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings

## License

Dual-licensed under MIT or Apache-2.0, at your option.
```

- [ ] **Step 3: Run the full local check**

Run: `pnpm install --frozen-lockfile` then `pnpm typecheck` then `pnpm lint` then `pnpm test` then `pnpm build` then `cargo fmt --all -- --check` then `cargo clippy --workspace --all-targets -- -D warnings` then `cargo test --workspace`
Expected: every command exits 0.

- [ ] **Step 4: Manual smoke test (acceptance criteria 1 and 4)**

Run: `pnpm tauri dev`, then check each of these:
1. The empty state shows "Try server-everything". Click it. The consent dialog shows the exact command, and Cancel has focus. Press Tab twice: focus cycles between the two buttons and never leaves the dialog.
2. Click "Run command". The header reads "● Connected to … · N tools · listed in X ms", with X under 2000.
3. Select `echo`, type a message, press Run tool. The result shows "✓ Success" and the echoed text.
4. Select a tool with nested or enum parameters. Submit empty: inline "Required" errors appear and focus moves to the first one. Toggle Raw JSON and back: values are kept.
5. Click Disconnect. In Task Manager (Windows) or `ps` (macOS/Linux), no `node` process for server-everything remains.
6. Connect again, then close the window. No server process remains.
7. Switch the OS to dark mode. The app follows, and focus rings stay visible.

Write down any failure as a bug with its reproduction steps. Fix it before committing.

- [ ] **Step 5: Commit**

```bash
git add .github README.md
git commit -m "ci: run frontend and Rust checks on Linux, macOS and Windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
