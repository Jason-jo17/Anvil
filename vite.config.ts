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
