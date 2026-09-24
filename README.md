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
