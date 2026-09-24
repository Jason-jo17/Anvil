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
