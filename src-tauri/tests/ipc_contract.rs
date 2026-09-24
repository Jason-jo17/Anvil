//! Drives the real command registration through Tauri's IPC layer with the exact argument names the frontend sends
//! (see `src/lib/ipc.ts`), so a camelCase/snake_case mismatch fails here instead of in the app.

use anvil_app_lib::{configure, registry};
use anvil_core::{McpSession, SessionOptions, fixture::spawn_fixture};
use serde_json::{Value, json};
use tauri::{
    Manager,
    ipc::{CallbackFn, InvokeBody},
    test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets},
    webview::InvokeRequest,
};

fn app() -> (tauri::App<MockRuntime>, tauri::WebviewWindow<MockRuntime>) {
    let app = configure(mock_builder()).build(mock_context(noop_assets())).expect("mock app");
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("webview");
    (app, webview)
}

fn invoke(webview: &tauri::WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "http://tauri.localhost".parse().unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().expect("json response"))
}

#[test]
fn connect_stdio_accepts_the_frontend_spec_shape_and_requires_consent() {
    let (_app, webview) = app();
    let spec = json!({ "command": "npx", "args": ["-y", "x"], "env": {}, "cwd": null });
    let error = invoke(&webview, "connect_stdio", json!({ "spec": spec, "consented": false })).unwrap_err();
    assert_eq!(error["kind"], "consentRequired", "{error}");
}

#[test]
fn commands_take_camel_case_connection_ids() {
    let (app, webview) = app();
    let id = tauri::async_runtime::block_on(async {
        let (io, _server) = spawn_fixture();
        let session = McpSession::connect_with(io, SessionOptions::default()).await.expect("connect");
        app.state::<registry::Registry>().insert(registry::Connection { session, process: None })
    });

    let tools = invoke(&webview, "list_tools", json!({ "connectionId": id })).expect("list_tools");
    assert_eq!(tools.as_array().map(Vec::len), Some(3), "{tools}");

    let args = json!({ "connectionId": id, "name": "echo", "arguments": { "message": "hi" } });
    let result = invoke(&webview, "call_tool", args).expect("call_tool");
    assert_eq!(result["content"][0]["text"], "Echo: hi");

    invoke(&webview, "disconnect", json!({ "connectionId": id })).expect("disconnect");
    let error = invoke(&webview, "list_tools", json!({ "connectionId": id })).unwrap_err();
    assert_eq!(error["kind"], "notFound", "{error}");
}
