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

type Connections = Arc<Mutex<HashMap<String, Arc<Connection>>>>;

/// Open connections by id. The lock is never held across an await, so a slow tool call never blocks disconnect.
#[derive(Default)]
pub struct Registry {
    connections: Connections,
}

fn lock(connections: &Connections) -> MutexGuard<'_, HashMap<String, Arc<Connection>>> {
    connections.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Registry {
    pub fn insert(&self, connection: Connection) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.lock().insert(id.clone(), Arc::new(connection));
        id
    }

    /// Like `insert`, and also watches the session: if the server exits on its own (not via `disconnect`), the entry
    /// is removed and `on_unexpected_exit(id, stderr_tail)` runs once, so the UI can say so right away.
    pub fn insert_watched(
        &self,
        connection: Connection,
        on_unexpected_exit: impl FnOnce(String, Vec<String>) + Send + 'static,
    ) -> String {
        let id = self.insert(connection);
        let connection = self.lock().get(&id).cloned().expect("just inserted");
        let connections = Arc::clone(&self.connections);
        let watched_id = id.clone();
        tauri::async_runtime::spawn(async move {
            connection.session.closed().await;
            // Still registered means nobody called disconnect: the server went away by itself.
            if lock(&connections).remove(&watched_id).is_some() {
                let stderr_tail = connection.process.as_ref().map(|p| p.stderr.lines()).unwrap_or_default();
                on_unexpected_exit(watched_id, stderr_tail);
            }
        });
        id
    }

    pub fn open_count(&self) -> usize {
        self.lock().len()
    }

    pub async fn list_tools(&self, id: &str) -> Result<Vec<ToolSummary>, IpcError> {
        let connection = self.get(id)?;
        let result = connection.session.list_tools().await;
        self.settle(id, &connection, result).await
    }

    pub async fn call_tool(&self, id: &str, name: &str, arguments: Map<String, Value>) -> Result<Value, IpcError> {
        let connection = self.get(id)?;
        let result = connection.session.call_tool(name, arguments).await;
        self.settle(id, &connection, result).await
    }

    /// A server that went away is dropped from the registry, and its last stderr lines explain why.
    async fn settle<T>(&self, id: &str, connection: &Connection, result: Result<T, CoreError>) -> Result<T, IpcError> {
        match result {
            Err(CoreError::Disconnected) => {
                self.lock().remove(id);
                connection.session.close().await;
                let mut error = IpcError::from(CoreError::Disconnected);
                if let Some(process) = &connection.process {
                    error.stderr_tail = process.stderr.lines();
                }
                Err(error)
            }
            other => other.map_err(IpcError::from),
        }
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
        lock(&self.connections)
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

    #[tokio::test]
    async fn a_server_that_died_reports_its_stderr_and_is_removed() {
        let (io, server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        let stderr = anvil_core::stdio::StderrTail::default();
        stderr.push("fatal: lost database connection".into());
        let registry = Registry::default();
        let id = registry.insert(Connection { session, process: Some(ProcessInfo { pid: None, stderr }) });

        server.abort();
        let _ = server.await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let error = registry.list_tools(&id).await.unwrap_err();
        assert_eq!(error.kind, "disconnected");
        assert_eq!(error.stderr_tail, ["fatal: lost database connection"]);
        assert_eq!(registry.open_count(), 0, "a dead connection must not stay registered");
    }

    #[tokio::test]
    async fn an_unexpected_exit_is_reported_once_with_stderr_and_removed() {
        let (io, server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        let stderr = anvil_core::stdio::StderrTail::default();
        stderr.push("panic: out of memory".into());
        let registry = Registry::default();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let id = registry.insert_watched(Connection { session, process: Some(ProcessInfo { pid: None, stderr }) }, {
            move |closed_id, tail| {
                let _ = tx.send((closed_id, tail));
            }
        });

        server.abort();
        let (closed_id, tail) =
            tokio::time::timeout(std::time::Duration::from_secs(3), rx).await.expect("no exit report").unwrap();
        assert_eq!(closed_id, id);
        assert_eq!(tail, ["panic: out of memory"]);
        assert_eq!(registry.open_count(), 0);
    }

    #[tokio::test]
    async fn a_user_disconnect_is_not_reported_as_an_unexpected_exit() {
        let registry = Registry::default();
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let id = registry.insert_watched(fixture_connection().await, move |_, _| {
            let _ = tx.send(());
        });
        registry.disconnect(&id).await.unwrap();
        let reported = tokio::time::timeout(std::time::Duration::from_millis(500), rx).await;
        assert!(!matches!(reported, Ok(Ok(()))), "user disconnect was reported as a crash");
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
