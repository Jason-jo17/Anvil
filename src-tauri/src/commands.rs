use anvil_core::{
    ServerSummary, SessionOptions, ToolSummary,
    stdio::{self, SpawnConsent, StdioSpec},
};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::State;

use crate::registry::{IpcError, Registry};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub connection_id: String,
    pub server: ServerSummary,
}

#[tauri::command]
pub async fn connect_stdio(
    registry: State<'_, Registry>,
    spec: StdioSpec,
    consented: bool,
) -> Result<ConnectResult, IpcError> {
    // `consented` is sent only by the consent dialog's confirm button, which shows this exact command line.
    if !consented {
        return Err(IpcError::consent_required());
    }
    let consent = SpawnConsent::granted_for(&spec);
    let connection = stdio::connect_stdio(&spec, &consent, SessionOptions::default()).await?;
    let server = connection.session.server().clone();
    Ok(ConnectResult { connection_id: registry.insert(connection.into()), server })
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
