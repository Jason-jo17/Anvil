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
