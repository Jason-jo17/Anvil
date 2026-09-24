mod commands;
pub mod registry;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(registry::Registry::default())
        .invoke_handler(tauri::generate_handler![
            commands::connect_stdio,
            commands::list_tools,
            commands::call_tool,
            commands::disconnect,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the MCP Anvil app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Stop every server we spawned so no child process outlives the app.
                tauri::async_runtime::block_on(app.state::<registry::Registry>().close_all());
            }
        });
}
