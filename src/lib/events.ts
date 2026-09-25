import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Payload of the backend's `anvil://connection-closed` event (see src-tauri/src/commands.rs). */
export interface ConnectionClosed {
  connectionId: string;
  stderrTail: string[];
}

/** Calls `handler` whenever a server exits without the user disconnecting. */
export function onConnectionClosed(handler: (event: ConnectionClosed) => void): Promise<UnlistenFn> {
  return listen<ConnectionClosed>("anvil://connection-closed", (event) => handler(event.payload));
}
