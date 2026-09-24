//! Protocol, transport and domain logic for MCP Anvil. Nothing in this crate knows about Tauri or the UI.

pub mod error;
pub mod model;

pub use error::CoreError;
pub use model::{ServerSummary, ToolSummary};
