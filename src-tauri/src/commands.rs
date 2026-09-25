use anvil_core::{
    ServerSummary, SessionOptions, ToolSummary,
    stdio::{self, SpawnConsent, StdioSpec},
};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::registry::{IpcError, Registry};

/// Emitted when a server exits without the user disconnecting (crash, `exit()`, killed).
pub const CONNECTION_CLOSED_EVENT: &str = "anvil://connection-closed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionClosed {
    pub connection_id: String,
    pub stderr_tail: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub connection_id: String,
    pub server: ServerSummary,
}

#[tauri::command]
pub async fn connect_stdio<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    spec: StdioSpec,
    consented: bool,
) -> Result<ConnectResult, IpcError> {
    // `consented` is sent only by the consent dialog's confirm button, which shows this exact command line.
    if !consented {
        return Err(IpcError::consent_required());
    }
    let consent = SpawnConsent::granted_for(&spec);
    let connection = stdio::connect_stdio(&spec, &consent, SessionOptions::for_stdio()).await?;
    let server = connection.session.server().clone();
    let connection_id = registry.insert_watched(connection.into(), move |connection_id, stderr_tail| {
        let _ = app.emit(CONNECTION_CLOSED_EVENT, ConnectionClosed { connection_id, stderr_tail });
    });
    Ok(ConnectResult { connection_id, server })
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
