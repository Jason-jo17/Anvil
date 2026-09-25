use std::{fmt, future::Future, time::Duration};

use rmcp::{
    RoleClient, ServiceError, ServiceExt,
    model::{CallToolRequestParams, ClientCapabilities, ClientConfig, Implementation},
    service::{Peer, RunningServiceCancellationToken},
    transport::IntoTransport,
};
use serde_json::{Map, Value, json};
use tokio::sync::{Mutex, watch};

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

impl SessionOptions {
    /// Launchers like `npx -y` download the server package on first run, so startup gets a longer budget.
    pub fn for_stdio() -> Self {
        Self { connect_timeout: Duration::from_secs(120), ..Self::default() }
    }
}

/// One initialized MCP client session. Requests go through a cloned `Peer`, so a long call never blocks `close`.
/// The running service lives in a watcher task, which flips `closed` when the connection ends for any reason.
pub struct McpSession {
    peer: Peer<RoleClient>,
    cancel: Mutex<Option<RunningServiceCancellationToken>>,
    closed: watch::Receiver<bool>,
    server: ServerSummary,
    options: SessionOptions,
}

/// How Anvil introduces itself in `initialize`, so server logs name the client correctly.
fn client_config() -> ClientConfig {
    ClientConfig::new(
        ClientCapabilities::default(),
        Implementation::new("mcp-anvil", env!("CARGO_PKG_VERSION")).with_title("MCP Anvil"),
    )
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
        let service = tokio::time::timeout(options.connect_timeout, client_config().serve(transport))
            .await
            .map_err(|_| CoreError::Timeout { what: "initialize", after: options.connect_timeout })?
            .map_err(|e| CoreError::Protocol(e.to_string()))?;
        let info = serde_json::to_value(service.peer_info()).map_err(|e| CoreError::InvalidData(e.to_string()))?;
        let server = ServerSummary::from_initialize_result(info)?;
        let peer = service.peer().clone();
        let cancel = service.cancellation_token();
        let (closed_tx, closed) = watch::channel(false);
        tokio::spawn(async move {
            let _ = service.waiting().await;
            let _ = closed_tx.send(true);
        });
        Ok(Self { peer, cancel: Mutex::new(Some(cancel)), closed, server, options })
    }

    /// Resolves once the connection has ended: the server exited or crashed, or `close` was called.
    pub async fn closed(&self) {
        let mut closed = self.closed.clone();
        let _ = closed.wait_for(|is_closed| *is_closed).await;
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
        let cancel = self.cancel.lock().await.take();
        if let Some(cancel) = cancel {
            cancel.cancel();
        }
        self.closed().await;
    }

    async fn request<T>(
        &self,
        what: &'static str,
        request: impl Future<Output = Result<T, ServiceError>>,
    ) -> Result<T, CoreError> {
        if *self.closed.borrow() || self.cancel.lock().await.is_none() {
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
    fn stdio_startup_allows_for_a_first_run_package_download() {
        assert!(SessionOptions::for_stdio().connect_timeout >= Duration::from_secs(120));
        assert_eq!(SessionOptions::for_stdio().request_timeout, SessionOptions::default().request_timeout);
    }

    #[tokio::test]
    async fn identifies_itself_to_servers_as_mcp_anvil() {
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let server = tokio::spawn(async move { crate::fixture::FixtureServer.serve(server_io).await.expect("serve") });
        let _session = McpSession::connect_with(client_io, SessionOptions::default()).await.unwrap();
        let running = server.await.unwrap();
        let client = serde_json::to_value(running.peer_info()).unwrap();
        assert_eq!(client["clientInfo"]["name"], "mcp-anvil");
        assert_eq!(client["clientInfo"]["title"], "MCP Anvil");
        assert_eq!(client["clientInfo"]["version"], env!("CARGO_PKG_VERSION"));
    }

    #[tokio::test]
    async fn closed_resolves_when_the_server_goes_away() {
        let (session, server) = connect().await;
        let watcher = tokio::spawn(async move {
            session.closed().await;
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(!watcher.is_finished(), "closed() resolved while the server was still up");
        server.abort();
        tokio::time::timeout(Duration::from_secs(2), watcher).await.expect("closed() never resolved").unwrap();
    }

    #[tokio::test]
    async fn closed_resolves_after_close() {
        let (session, _server) = connect().await;
        session.close().await;
        tokio::time::timeout(Duration::from_secs(2), session.closed()).await.expect("closed() never resolved");
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
