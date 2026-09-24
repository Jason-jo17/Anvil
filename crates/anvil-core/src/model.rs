use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::CoreError;

/// A tool as advertised by `tools/list`, mirroring the MCP wire shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSummary {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "empty_object_schema")]
    pub input_schema: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Value>,
}

fn empty_object_schema() -> Value {
    json!({ "type": "object" })
}

impl ToolSummary {
    pub fn from_wire(value: Value) -> Result<Self, CoreError> {
        serde_json::from_value(value).map_err(|e| CoreError::InvalidData(format!("tool: {e}")))
    }
}

/// Who we are talking to, taken from the `initialize` result.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSummary {
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub protocol_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    pub capabilities: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireInitializeResult {
    protocol_version: String,
    #[serde(default)]
    capabilities: Value,
    server_info: WireImplementation,
    #[serde(default)]
    instructions: Option<String>,
}

#[derive(Deserialize)]
struct WireImplementation {
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    title: Option<String>,
}

impl ServerSummary {
    pub fn from_initialize_result(value: Value) -> Result<Self, CoreError> {
        let wire: WireInitializeResult =
            serde_json::from_value(value).map_err(|e| CoreError::InvalidData(format!("initialize result: {e}")))?;
        Ok(Self {
            name: wire.server_info.name,
            version: wire.server_info.version,
            title: wire.server_info.title,
            protocol_version: wire.protocol_version,
            instructions: wire.instructions,
            capabilities: wire.capabilities,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_wire_tool_and_ignores_unknown_fields() {
        let tool = ToolSummary::from_wire(json!({
            "name": "create_ticket",
            "title": "Create ticket",
            "description": "Opens a ticket",
            "inputSchema": { "type": "object", "properties": { "title": { "type": "string" } } },
            "outputSchema": { "type": "object" },
            "annotations": { "readOnlyHint": false },
            "icons": [{ "src": "https://example.com/i.png" }],
            "execution": { "taskSupport": "optional" },
            "_meta": { "x": 1 }
        }))
        .unwrap();
        assert_eq!(tool.name, "create_ticket");
        assert_eq!(tool.title.as_deref(), Some("Create ticket"));
        assert_eq!(tool.input_schema["properties"]["title"]["type"], "string");
        assert!(tool.output_schema.is_some());
    }

    #[test]
    fn a_tool_without_input_schema_gets_an_empty_object_schema() {
        let tool = ToolSummary::from_wire(json!({ "name": "ping" })).unwrap();
        assert_eq!(tool.input_schema, json!({ "type": "object" }));
    }

    #[test]
    fn a_tool_without_a_name_is_invalid_data() {
        let error = ToolSummary::from_wire(json!({ "description": "nameless" })).unwrap_err();
        assert!(matches!(error, CoreError::InvalidData(_)), "{error:?}");
    }

    #[test]
    fn serializes_tools_in_wire_camel_case_without_empty_optionals() {
        let tool = ToolSummary::from_wire(json!({ "name": "ping" })).unwrap();
        let wire = serde_json::to_value(&tool).unwrap();
        assert_eq!(wire, json!({ "name": "ping", "inputSchema": { "type": "object" } }));
    }

    #[test]
    fn parses_server_summary_from_an_initialize_result() {
        let server = ServerSummary::from_initialize_result(json!({
            "protocolVersion": "2025-11-25",
            "capabilities": { "tools": { "listChanged": true } },
            "serverInfo": { "name": "everything", "version": "2026.8.31", "title": "Everything" },
            "instructions": "Test server"
        }))
        .unwrap();
        assert_eq!(server.name, "everything");
        assert_eq!(server.title.as_deref(), Some("Everything"));
        assert_eq!(server.protocol_version, "2025-11-25");
        let wire = serde_json::to_value(&server).unwrap();
        assert_eq!(wire["protocolVersion"], "2025-11-25");
    }

    #[test]
    fn an_initialize_result_without_server_info_is_invalid_data() {
        let error = ServerSummary::from_initialize_result(json!({ "protocolVersion": "x" })).unwrap_err();
        assert!(matches!(error, CoreError::InvalidData(_)), "{error:?}");
    }
}
