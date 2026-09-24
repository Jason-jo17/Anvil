# MCP Anvil — Product Spec (v1)

> Source of truth for scope and acceptance criteria. Stable working rules live in `/CLAUDE.md`;
> decisions that deviate from this spec are recorded in `docs/ADRs/`.

## Product summary
MCP Anvil is a free, open-source, cross-platform DESKTOP workbench for the Model Context
Protocol. It connects to any MCP server (stdio, Streamable HTTP, legacy HTTP+SSE) with full
OAuth 2.1 / CIMD flows, inspects tools/resources/prompts, auto-generates input forms from JSON
Schema, records and replays sessions, runs regression/snapshot test suites, checks spec
conformance (2025-11-25 and 2026-07-28), lints for security issues (tool poisoning, prompt
injection in descriptions, excessive permissions), runs load/latency tests, evaluates whether a
BYOK LLM picks the right tool, compares multiple servers side by side, and exports everything to a
headless CLI + GitHub Action. Privacy-first: no telemetry, all data local, BYOK for any AI.

## Target users
1. MCP server authors who have outgrown clicking through Inspector by hand.
2. Platform/AppSec engineers vetting third-party MCP servers before deployment.
3. Agent developers who need to know if a real model+client actually selects the right tool.

## Non-goals (v1)
No hosting/deployment, no registry publishing, no team cloud sync, no server scaffolding/codegen.

## v1 scope (ship in ~2 weeks)
- Connections: stdio (child process), Streamable HTTP (2026-07-28 stateless + header routing),
  legacy HTTP+SSE (2025-11-25), with OAuth 2.1 (PKCE, RFC 9207 iss validation, CIMD, DCR fallback).
- Explorer: list + inspect tools/resources/prompts; render JSON Schema (draft 2020-12) incl.
  $ref, anyOf/oneOf, enums; show structured outputSchema; icons metadata.
- Invoke: auto-generated forms with validation; raw JSON-RPC view; MRTR input_required handling
  (elicitation + sampling round-trips); response visualizer (JSON/table/text/image/resource-link).
- Session record/replay: capture every request/response with timing; replay against same or a
  different server; deterministic ordering.
- Regression suites: snapshot assertions (exact/normalized) + custom assertions (JSONPath equals,
  contains, schema-valid, latency < N ms); save as YAML; run all; red/green diff.
- Spec conformance: validate handshake behavior, header presence (Mcp-Method/Mcp-Name), cache
  hints (ttlMs/cacheScope), pagination, error shapes, against a chosen protocol era.
- Security lint: scan tool/prompt/resource descriptions and schemas for injected instructions
  (hidden XML/imperative text), tool-name shadowing/collisions, excessive declared scopes/roots,
  unpinned mutable descriptions (rug-pull hash tracking). Rules engine + severity + rationale.
- Load/latency: fire N concurrent callers, chart p50/p95/p99, error rate, first-token latency.
- LLM-in-the-loop eval (BYOK): given a natural-language task + the server's tool catalog, ask the
  configured model (Anthropic/OpenAI/Gemini/Ollama/OpenAI-compatible) which tool + args it would
  call; score against expected tool. Multi-model side-by-side.
- Multi-server compare: diff tool catalogs/schemas between two servers or two versions.
- CI export: `anvil run suite.yaml` headless runner (exit codes) + a GitHub Action wrapper.

## Later scope (post-v1)
Proxy/man-in-the-middle capture of real client↔server traffic; OpenTelemetry span join; team
sync; plugin API for custom security rules; MCP Apps (UI) rendering; Windows/macOS notarized store.

## Pinned tech stack (VERIFY at build)
- Shell: Tauri 2.11.x (crate `tauri` 2.11.5, `@tauri-apps/api` 2.11.x, `wry` 0.56.x). Rust 2024 ed.
- MCP client core (Rust): official `rmcp` (2026-07-28 support) — VERIFY latest on crates.io; if the
  official crate lags for a needed feature, allow `rust-mcp-sdk` 2.x as fallback. Justify in ADR.
- Frontend: React 19 + TypeScript 5.x + Vite 6; state via Zustand; forms via a JSON-Schema form
  renderer (RJSF or custom with Ajv 2020-12). Charts via visx or uPlot (load tests).
- LLM eval: BYOK via provider adapters (Anthropic, OpenAI, Google, Ollama, OpenAI-compatible).
  Keys stored in OS keychain via `tauri-plugin-stronghold` or `keyring` crate. Never on disk plain.
- Persistence: SQLite via `sqlx` (sessions, suites, results); suites also exportable as YAML.
- CLI: a second Rust binary `anvil` sharing the core crate; `clap` for args; JSON output + jq-able.

## Repo structure
```
mcp-anvil/
  crates/
    anvil-core/      # transports, MCP client, schema, security rules, eval, load engine
    anvil-cli/       # headless runner binary
  src-tauri/         # Tauri app (thin: commands -> anvil-core)
  src/               # React frontend
  suites/            # example YAML test suites
  .github/workflows/ # ci.yml (test+lint), release.yml (matrix build+sign+publish)
  action/            # composite GitHub Action wrapping anvil-cli
  docs/  ADRs/  LICENSE  README.md  SECURITY.md  CONTRIBUTING.md
```

## Data models (SQLite)
- connection(id, name, transport, endpoint/cmd, auth_json, protocol_era, created_at)
- session(id, connection_id, started_at) ; message(id, session_id, dir, method, payload_json, ts_ms, latency_ms)
- suite(id, name, yaml) ; assertion(id, suite_id, kind, target, expected_json)
- run(id, suite_id, started_at, status) ; run_result(id, run_id, assertion_id, pass, actual_json, latency_ms)
- security_finding(id, connection_id, rule_id, severity, target, evidence, rationale, ts)
- eval(id, connection_id, model, task, expected_tool, chosen_tool, chosen_args_json, pass, ts)

## Feature specs & acceptance criteria (each = a Claude Code task with tests)
1. Connect stdio server (server-everything). AC: tools/list renders within 2s; disconnect clean.
2. Connect Streamable HTTP 2026-07-28. AC: requests carry Mcp-Method/Mcp-Name; no session header;
   server/discover optional path works.
3. OAuth 2.1 + CIMD + iss validation. AC: localhost redirect succeeds (application_type set); a
   mismatched iss is rejected with a clear error.
4. JSON-Schema forms. AC: $ref, anyOf, enum, nested objects, arrays all render + validate; invalid
   input blocked with inline errors; raw JSON toggle round-trips.
5. MRTR input_required. AC: an elicitation round-trip shows a form, resubmits with inputResponses,
   completes the original call.
6. Record/replay. AC: a recorded session replays with identical requests; timing captured.
7. Regression suite. AC: a snapshot passes green; mutating server output turns it red with a diff.
8. Conformance. AC: a server missing required headers is flagged per selected era.
9. Security lint. AC: a tool description with hidden imperative text is flagged HIGH with the
   offending substring; a benign server yields zero findings; name collisions detected.
10. Load test. AC: 50 concurrent calls produce a p95 chart and error rate; cancel works.
11. LLM eval (BYOK). AC: given a task, the model's chosen tool is compared to expected; two models
    render side by side; missing key shows a friendly BYOK prompt, never a crash.
12. Multi-server compare. AC: schema diff highlights added/removed/changed fields.
13. CLI + Action. AC: `anvil run suite.yaml --format json` exits non-zero on failure; the Action
    fails the job and uploads a report artifact.

## Security requirements
- No telemetry, ever. Outbound network only to: the MCP server under test and the BYOK LLM endpoint.
- API keys in OS keychain; redact keys/tokens in all logs and exported reports.
- Sandboxed stdio child processes; explicit user consent before spawning a local command.
- Ship the Inspector CVE lesson: local control API requires an auth token; never bind to 0.0.0.0.
- Security-lint findings are advisory and clearly labeled; link each rule to its rationale/CWE.

## Elite UI/UX requirements
- Design tokens (color/space/type/radius/motion) in one source; light + dark themes.
- WCAG AA: contrast, visible focus rings, full keyboard operation, ARIA on custom widgets, reduced-
  motion honoring `prefers-reduced-motion`.
- Command palette (Cmd/Ctrl-K), global shortcuts, and per-view shortcuts documented in an overlay.
- Research-backed micro-interactions: 150–250ms ease-out transitions, optimistic UI on invoke,
  skeleton loaders, red/green diff animations that also encode state non-chromatically.
- Empty states that teach (sample server-everything one click away).

## Packaging + CI/CD
- release.yml matrix: macos-latest (universal), ubuntu-22.04, windows-latest, via tauri-action.
- Signing: macOS Developer ID + notarization; Windows Authenticode (or SmartScreen note if self-
  signed for OSS); Linux AppImage + .deb + .rpm.
- Auto-update via tauri-plugin-updater with a signed update manifest; user opt-in.
- ci.yml: cargo test, cargo clippy -D warnings, cargo audit, eslint, vitest, typecheck.

## Testing strategy
- Rust unit tests for transports, schema rendering, security rules (golden poisoned/benign fixtures),
  assertion engine. Integration tests against `@modelcontextprotocol/server-everything`.
- Frontend: Vitest + React Testing Library; Storybook for tokens/components; Playwright for a smoke
  e2e (connect → invoke → assert).
- Coverage gate ≥80% on anvil-core.

## Open-source hygiene
- License: MIT OR Apache-2.0 (dual) to match the Rust/MCP ecosystem and maximize adoption.
- SECURITY.md with private disclosure; CODE_OF_CONDUCT; CONTRIBUTING; conventional commits;
  semantic-release; issue/PR templates; a "good first issue" set of custom security rules.

## Milestone plan (~2 weeks, solo + Opus 5)
- Days 1–2: scaffold Tauri+React+core; stdio connect; tools/list; JSON-Schema form MVP.
- Days 3–4: Streamable HTTP + legacy SSE; OAuth/CIMD; MRTR.
- Days 5–6: record/replay + SQLite; response visualizers.
- Days 7–8: regression suites (YAML) + conformance checks.
- Days 9–10: security lint rules engine + fixtures.
- Days 11–12: load/latency engine + charts; LLM eval (BYOK) + multi-model.
- Day 13: CLI + GitHub Action; multi-server compare.
- Day 14: packaging matrix, signing, auto-update, docs, polish, a11y pass.

## Recommended Claude Code setup
- Subagents (.claude/agents/): `explorer` (read-only repo/docs search), `rust-core-dev`,
  `frontend-dev`, `security-rules-author` (writes lint rules + fixtures), `test-writer`,
  `code-reviewer`. Scope tools tightly; remember permission modes inherit from parent.
- Hooks (.claude/hooks): PostToolUse → `cargo fmt` + `prettier`; PreToolUse → block writes outside
  repo; Stop → run `cargo test` + `vitest`; redact-secrets on shell commands.
- Skills (.claude/skills/*/SKILL.md): `mcp-spec-2026-07-28` (spec cheat-sheet), `tauri-release`
  (packaging/signing checklist), `wcag-aa-checklist`, `security-rule-pattern`.
- Keep CLAUDE.md short (stable rules only); push procedures into skills. Use Plan Mode first.

## Definition of done
All 13 ACs pass in CI on all three OSes; signed installers auto-update; zero clippy warnings;
a11y audit clean (axe) in the e2e; README GIFs; example suites run green; SECURITY.md live.
