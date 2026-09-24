# CLAUDE.md — MCP Anvil

Open-source, cross-platform desktop workbench for the Model Context Protocol (Tauri 2 + Rust core +
React). Connect to MCP servers, inspect and invoke tools, record/replay, test, lint, load-test, eval.
Full scope and acceptance criteria: `docs/SPEC.md`. Decisions that deviate from the spec: `docs/ADRs/`.
Implementation plans: `docs/superpowers/plans/`.

## Layout
- `crates/anvil-core/` — all protocol, transport and domain logic (no Tauri types here)
- `crates/anvil-cli/` — headless `anvil` runner (added in the Day 13 milestone)
- `src-tauri/` — thin Tauri shell: `#[tauri::command]` wrappers that call `anvil-core`
- `src/` — React 19 + TypeScript frontend (Zustand state, custom JSON-Schema forms on Ajv 2020-12)

## Commands
- Rust: `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all`
- Frontend: `pnpm test`, `pnpm typecheck`, `pnpm lint`
- App: `pnpm tauri dev`

## Rules
- No telemetry, ever. Outbound network only to the MCP server under test and the BYOK LLM endpoint.
- Never write API keys or tokens to disk in plain text or to logs; keys live in the OS keychain.
- Never spawn a local command without explicit user consent; never bind a listener to 0.0.0.0.
- Any local control API requires an auth token.
- Keep Tauri commands thin: logic and tests belong in `anvil-core`.
- Mirror MCP wire JSON (camelCase) in DTOs crossing the IPC boundary.
- Tests first (TDD). Zero clippy warnings. Conventional commits.
- UI: colors/spacing/type/radius/motion come from `src/styles/tokens.css` only; WCAG AA; visible
  focus rings; every control keyboard-operable; honor `prefers-reduced-motion`.
- Security-lint findings are advisory and must be labeled as such, each linked to rationale/CWE.
