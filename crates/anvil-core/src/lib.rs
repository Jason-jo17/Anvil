//! Protocol, transport and domain logic for MCP Anvil. Nothing in this crate knows about Tauri or the UI.

pub mod error;
#[cfg(any(test, feature = "test-fixture"))]
pub mod fixture;
pub mod model;
pub mod session;

pub use error::CoreError;
pub use model::{ServerSummary, ToolSummary};
pub use session::{McpSession, SessionOptions};
