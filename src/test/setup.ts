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
