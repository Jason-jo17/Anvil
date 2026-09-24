use std::{fmt, future::Future, time::Duration};

use rmcp::{
    RoleClient, ServiceError, ServiceExt,
    model::CallToolRequestParams,
    service::{Peer, RunningService},
    transport::IntoTransport,
};
use serde_json::{Map, Value, json};
use tokio::sync::Mutex;

use crate::{CoreError, ServerSummary, ToolSummary};

#[derive(Debug, Clone, Copy)]
pub struct SessionOptions {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
}

impl Default for SessionOptions {
    fn default() -> Self {
        Self { connect_timeout: Duration::from_secs(30), request_timeout: Duration::from_secs(60) }
    }
}

/// One initialized MCP client session. Requests go through a cloned `Peer`, so a long call never blocks `close`.
pub struct McpSession {
    peer: Peer<RoleClient>,
    service: Mutex<Option<RunningService<RoleClient, ()>>>,
    server: ServerSummary,
    options: SessionOptions,
}

impl fmt::Debug for McpSession {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("McpSession").field("server", &self.server).finish_non_exhaustive()
    }
}

impl McpSession {
    pub async fn connect_with<T, E, A>(transport: T, options: SessionOptions) -> Result<Self, CoreError>
    where
        T: IntoTransport<RoleClient, E, A>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let service = tokio::time::timeout(options.connect_timeout, ().serve(transport))
            .await
            .map_err(|_| CoreError::Timeout { what: "initialize", after: options.connect_timeout })?
            .map_err(|e| CoreError::Protocol(e.to_string()))?;
        let info = serde_json::to_value(service.peer_info()).map_err(|e| CoreError::InvalidData(e.to_string()))?;
        let server = ServerSummary::from_initialize_result(info)?;
        Ok(Self { peer: service.peer().clone(), service: Mutex::new(Some(service)), server, options })
    }

    pub fn server(&self) -> &ServerSummary {
        &self.server
    }

    pub async fn list_tools(&self) -> Result<Vec<ToolSummary>, CoreError> {
        let tools = self.request("tools/list", self.peer.list_all_tools()).await?;
        tools
            .into_iter()
            .map(|tool| {
                serde_json::to_value(tool)
                    .map_err(|e| CoreError::InvalidData(e.to_string()))
                    .and_then(ToolSummary::from_wire)
            })
            .collect()
    }

    pub async fn call_tool(&self, name: &str, arguments: Map<String, Value>) -> Result<Value, CoreError> {
        // Built through serde so we depend on the MCP wire shape, not on rmcp's constructor API.
        let params: CallToolRequestParams = serde_json::from_value(json!({ "name": name, "arguments": arguments }))
            .map_err(|e| CoreError::InvalidData(e.to_string()))?;
        let result = self.request("tools/call", self.peer.call_tool(params)).await?;
        serde_json::to_value(result).map_err(|e| CoreError::InvalidData(e.to_string()))
    }

    /// Ends the session and, for child-process transports, stops the server. Safe to call more than once.
    pub async fn close(&self) {
        let service = self.service.lock().await.take();
        if let Some(service) = service {
            let _ = service.cancel().await;
        }
    }

    async fn request<T>(
        &self,
        what: &'static str,
        request: impl Future<Output = Result<T, ServiceError>>,
    ) -> Result<T, CoreError> {
        if self.service.lock().await.is_none() {
            return Err(CoreError::Disconnected);
        }
        match tokio::time::timeout(self.options.request_timeout, request).await {
            Err(_) => Err(CoreError::Timeout { what, after: self.options.request_timeout }),
            Ok(Err(error)) => Err(map_service_error(error)),
            Ok(Ok(value)) => Ok(value),
        }
    }
}

fn map_service_error(error: ServiceError) -> CoreError {
    match error {
        // A failed write (e.g. a broken pipe to a killed stdio server) means the server is gone, same as a closed transport.
        ServiceError::TransportClosed | ServiceError::TransportSend(_) => CoreError::Disconnected,
        other => CoreError::Protocol(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixture::spawn_fixture;

    fn args(value: Value) -> Map<String, Value> {
        value.as_object().expect("object").clone()
    }

    async fn connect() -> (McpSession, tokio::task::JoinHandle<()>) {
        let (io, server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        (session, server)
    }

    #[tokio::test]
    async fn connects_and_lists_fixture_tools() {
        let (session, _server) = connect().await;
        assert!(!session.server().protocol_version.is_empty());
        let mut names: Vec<String> = session.list_tools().await.unwrap().into_iter().map(|t| t.name).collect();
        names.sort();
        assert_eq!(names, ["create_ticket", "echo", "sleep"]);
    }

    #[tokio::test]
    async fn nested_params_arrive_as_json_schema() {
        let (session, _server) = connect().await;
        let tools = session.list_tools().await.unwrap();
        let ticket = tools.iter().find(|t| t.name == "create_ticket").unwrap();
        let properties = &ticket.input_schema["properties"];
        for key in ["title", "priority", "tags", "address"] {
            assert!(properties[key].is_object(), "missing {key} in {properties}");
        }
    }

    #[tokio::test]
    async fn calls_a_tool_and_returns_wire_json() {
        let (session, _server) = connect().await;
        let result = session.call_tool("echo", args(json!({ "message": "hi" }))).await.unwrap();
        assert_eq!(result["content"][0]["text"], "Echo: hi");
        assert_ne!(result.get("isError"), Some(&Value::Bool(true)));
    }

    #[tokio::test]
    async fn an_unknown_tool_is_a_protocol_error() {
        let (session, _server) = connect().await;
        let error = session.call_tool("nope", Map::new()).await.unwrap_err();
        assert!(matches!(error, CoreError::Protocol(_)), "{error:?}");
    }

    #[tokio::test]
    async fn slow_requests_time_out() {
        let (io, _server) = spawn_fixture();
        let options = SessionOptions { request_timeout: Duration::from_millis(100), ..SessionOptions::default() };
        let session = McpSession::connect_with(io, options).await.unwrap();
        let error = session.call_tool("sleep", args(json!({ "ms": 5000 }))).await.unwrap_err();
        assert!(matches!(error, CoreError::Timeout { what: "tools/call", .. }), "{error:?}");
    }

    #[tokio::test]
    async fn a_silent_peer_times_out_during_initialize() {
        let (io, _peer_kept_open) = tokio::io::duplex(1024);
        let options = SessionOptions { connect_timeout: Duration::from_millis(100), ..SessionOptions::default() };
        let error = McpSession::connect_with(io, options).await.unwrap_err();
        assert!(matches!(error, CoreError::Timeout { what: "initialize", .. }), "{error:?}");
    }

    #[tokio::test]
    async fn the_server_going_away_surfaces_as_disconnected() {
        let (session, server) = connect().await;
        server.abort();
        let _ = server.await;
        tokio::time::sleep(Duration::from_millis(50)).await;
        let error = session.list_tools().await.unwrap_err();
        assert!(matches!(error, CoreError::Disconnected), "{error:?}");
    }

    #[test]
    fn a_write_to_a_dead_server_counts_as_disconnected() {
        // macOS reports a killed stdio server as a broken pipe on the next write, before EOF is observed.
        let broken_pipe = ServiceError::TransportSend(rmcp::transport::DynamicTransportError::from_parts(
            "TokioChildProcess",
            std::any::TypeId::of::<()>(),
            Box::new(std::io::Error::from(std::io::ErrorKind::BrokenPipe)),
        ));
        assert!(matches!(map_service_error(broken_pipe), CoreError::Disconnected));
    }

    #[tokio::test]
    async fn close_is_idempotent_and_blocks_further_requests() {
        let (session, _server) = connect().await;
        session.close().await;
        session.close().await;
        let error = session.list_tools().await.unwrap_err();
        assert!(matches!(error, CoreError::Disconnected), "{error:?}");
    }
}
