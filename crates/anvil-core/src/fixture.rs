//! An in-process MCP server for tests, here and in `src-tauri` (via the `test-fixture` feature).

use std::time::Duration;

use rmcp::{ServiceExt, handler::server::wrapper::Parameters, tool, tool_router};
use schemars::JsonSchema;
use serde::Deserialize;
use tokio::{io::DuplexStream, task::JoinHandle};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EchoParams {
    pub message: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SleepParams {
    pub ms: u64,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    High,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct Address {
    pub city: String,
    pub zip: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TicketParams {
    pub title: String,
    pub priority: Priority,
    pub tags: Vec<String>,
    pub address: Address,
}

#[derive(Debug, Clone)]
pub struct FixtureServer;

#[tool_router(server_handler)]
impl FixtureServer {
    #[tool(description = "Echo the message back")]
    fn echo(&self, Parameters(p): Parameters<EchoParams>) -> String {
        format!("Echo: {}", p.message)
    }

    #[tool(description = "Sleep for `ms` milliseconds, then answer")]
    async fn sleep(&self, Parameters(p): Parameters<SleepParams>) -> String {
        tokio::time::sleep(Duration::from_millis(p.ms)).await;
        "slept".to_owned()
    }

    #[tool(description = "Create a support ticket")]
    fn create_ticket(&self, Parameters(p): Parameters<TicketParams>) -> String {
        format!("{} [{:?}] {} tags, {}", p.title, p.priority, p.tags.len(), p.address.city)
    }
}

/// Starts the fixture on one end of an in-memory pipe. Returns the client end and the server task;
/// abort the task to simulate the server dying.
pub fn spawn_fixture() -> (DuplexStream, JoinHandle<()>) {
    let (client_io, server_io) = tokio::io::duplex(64 * 1024);
    let handle = tokio::spawn(async move {
        if let Ok(running) = FixtureServer.serve(server_io).await {
            let _ = running.waiting().await;
        }
    });
    (client_io, handle)
}
