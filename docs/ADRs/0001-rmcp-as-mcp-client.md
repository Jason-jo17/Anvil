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
