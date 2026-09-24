use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};

use anvil_core::{
    CoreError, McpSession, ToolSummary,
    stdio::{ProcessInfo, StdioConnection},
};
use serde::Serialize;
use serde_json::{Map, Value};

/// The shape every failed command rejects with on the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub kind: &'static str,
    pub message: String,
    pub stderr_tail: Vec<String>,
}

impl From<CoreError> for IpcError {
    fn from(error: CoreError) -> Self {
        Self { kind: error.kind(), message: error.to_string(), stderr_tail: error.stderr_tail().to_vec() }
    }
}

impl IpcError {
    pub fn not_found(id: &str) -> Self {
        Self { kind: "notFound", message: format!("no open connection with id {id}"), stderr_tail: Vec::new() }
    }

    pub fn consent_required() -> Self {
        Self {
            kind: "consentRequired",
            message: "starting a local command requires explicit consent".into(),
            stderr_tail: Vec::new(),
        }
    }
}

pub struct Connection {
    pub session: McpSession,
    pub process: Option<ProcessInfo>,
}

impl From<StdioConnection> for Connection {
    fn from(connection: StdioConnection) -> Self {
        Self { session: connection.session, process: Some(connection.process) }
    }
}

/// Open connections by id. The lock is never held across an await, so a slow tool call never blocks disconnect.
#[derive(Default)]
pub struct Registry {
    connections: Mutex<HashMap<String, Arc<Connection>>>,
}

impl Registry {
    pub fn insert(&self, connection: Connection) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.lock().insert(id.clone(), Arc::new(connection));
        id
    }

    pub fn open_count(&self) -> usize {
        self.lock().len()
    }

    pub async fn list_tools(&self, id: &str) -> Result<Vec<ToolSummary>, IpcError> {
        let connection = self.get(id)?;
        Ok(connection.session.list_tools().await?)
    }

    pub async fn call_tool(&self, id: &str, name: &str, arguments: Map<String, Value>) -> Result<Value, IpcError> {
        let connection = self.get(id)?;
        Ok(connection.session.call_tool(name, arguments).await?)
    }

    pub async fn disconnect(&self, id: &str) -> Result<(), IpcError> {
        let connection = self.lock().remove(id).ok_or_else(|| IpcError::not_found(id))?;
        connection.session.close().await;
        Ok(())
    }

    pub async fn close_all(&self) {
        let connections: Vec<Arc<Connection>> = self.lock().drain().map(|(_, c)| c).collect();
        for connection in connections {
            connection.session.close().await;
        }
    }

    fn get(&self, id: &str) -> Result<Arc<Connection>, IpcError> {
        self.lock().get(id).cloned().ok_or_else(|| IpcError::not_found(id))
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, Arc<Connection>>> {
        self.connections.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use anvil_core::{SessionOptions, fixture::spawn_fixture};
    use serde_json::json;

    use super::*;

    async fn fixture_connection() -> Connection {
        let (io, _server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        Connection { session, process: None }
    }

    #[tokio::test]
    async fn lists_and_calls_tools_by_connection_id() {
        let registry = Registry::default();
        let id = registry.insert(fixture_connection().await);
        assert_eq!(registry.list_tools(&id).await.unwrap().len(), 3);
        let arguments = json!({ "message": "hi" }).as_object().unwrap().clone();
        let result = registry.call_tool(&id, "echo", arguments).await.unwrap();
        assert_eq!(result["content"][0]["text"], "Echo: hi");
    }

    #[tokio::test]
    async fn unknown_ids_are_not_found() {
        let registry = Registry::default();
        let error = registry.list_tools("missing").await.unwrap_err();
        assert_eq!(error.kind, "notFound");
    }

    #[tokio::test]
    async fn disconnect_removes_and_closes_the_session() {
        let registry = Registry::default();
        let id = registry.insert(fixture_connection().await);
        let connection = registry.get(&id).unwrap();
        registry.disconnect(&id).await.unwrap();
        assert_eq!(registry.open_count(), 0);
        assert_eq!(registry.list_tools(&id).await.unwrap_err().kind, "notFound");
        assert!(matches!(connection.session.list_tools().await, Err(CoreError::Disconnected)));
    }

    #[tokio::test]
    async fn close_all_closes_every_connection() {
        let registry = Registry::default();
        let a = registry.insert(fixture_connection().await);
        let b = registry.insert(fixture_connection().await);
        let (conn_a, conn_b) = (registry.get(&a).unwrap(), registry.get(&b).unwrap());
        registry.close_all().await;
        assert_eq!(registry.open_count(), 0);
        assert!(matches!(conn_a.session.list_tools().await, Err(CoreError::Disconnected)));
        assert!(matches!(conn_b.session.list_tools().await, Err(CoreError::Disconnected)));
    }

    #[test]
    fn core_errors_become_camel_case_ipc_errors() {
        let error =
            IpcError::from(CoreError::StartupFailed { reason: "exited".into(), stderr_tail: vec!["boom".into()] });
        let wire = serde_json::to_value(&error).unwrap();
        assert_eq!(wire["kind"], "startupFailed");
        assert_eq!(wire["message"], "the server failed to start: exited");
        assert_eq!(wire["stderrTail"], json!(["boom"]));
    }
}
