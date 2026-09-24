//! Integration tests against the reference server. Requires `pnpm install` at the repo root and `node` on PATH.

use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

use anvil_core::{
    CoreError, SessionOptions,
    stdio::{SpawnConsent, StdioConnection, StdioSpec, connect_stdio},
};
use serde_json::json;
use sysinfo::{Pid, ProcessStatus, ProcessesToUpdate, System};

fn everything() -> StdioSpec {
    let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../node_modules/@modelcontextprotocol/server-everything/dist/index.js");
    assert!(entry.exists(), "missing {}: run `pnpm install` at the repo root", entry.display());
    StdioSpec {
        command: "node".into(),
        args: vec![entry.to_string_lossy().into_owned(), "stdio".into()],
        env: Default::default(),
        cwd: None,
    }
}

async fn connect(spec: &StdioSpec) -> Result<StdioConnection, CoreError> {
    connect_stdio(spec, &SpawnConsent::granted_for(spec), SessionOptions::default()).await
}

fn is_running(pid: u32) -> bool {
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    system.process(pid).is_some_and(|p| p.status() != ProcessStatus::Zombie)
}

async fn wait_until_gone(pid: u32, within: Duration) -> bool {
    let deadline = Instant::now() + within;
    while Instant::now() < deadline {
        if !is_running(pid) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    !is_running(pid)
}

#[tokio::test]
async fn lists_tools_within_two_seconds_and_calls_echo() {
    let conn = connect(&everything()).await.expect("connect");
    let started = Instant::now();
    let tools = conn.session.list_tools().await.expect("tools/list");
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_secs(2), "tools/list took {elapsed:?}");
    assert!(
        tools.iter().any(|t| t.name == "echo"),
        "echo missing from {:?}",
        tools.iter().map(|t| &t.name).collect::<Vec<_>>()
    );

    let arguments = json!({ "message": "hello anvil" }).as_object().unwrap().clone();
    let result = conn.session.call_tool("echo", arguments).await.expect("tools/call");
    assert!(result.to_string().contains("hello anvil"), "{result}");
    conn.session.close().await;
}

#[tokio::test]
async fn disconnect_terminates_the_child_process() {
    let conn = connect(&everything()).await.expect("connect");
    let pid = conn.process.pid.expect("pid");
    assert!(is_running(pid));
    conn.session.close().await;
    assert!(wait_until_gone(pid, Duration::from_secs(5)).await, "server {pid} still running after close");
}

#[tokio::test]
async fn a_crash_mid_session_reports_disconnected() {
    let conn = connect(&everything()).await.expect("connect");
    let pid = conn.process.pid.expect("pid");
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true);
    assert!(system.process(Pid::from_u32(pid)).expect("process").kill());
    assert!(wait_until_gone(pid, Duration::from_secs(5)).await);

    let error = conn.session.list_tools().await.unwrap_err();
    assert!(matches!(error, CoreError::Disconnected), "{error:?}");
}

#[tokio::test]
async fn a_missing_command_is_reported_by_name() {
    let spec = StdioSpec {
        command: "anvil-definitely-not-installed".into(),
        args: vec![],
        env: Default::default(),
        cwd: None,
    };
    let error = connect(&spec).await.unwrap_err();
    assert!(matches!(error, CoreError::CommandNotFound(_)), "{error:?}");
}

#[tokio::test]
async fn a_server_that_dies_at_startup_reports_its_stderr() {
    let spec = StdioSpec {
        command: "node".into(),
        args: vec!["-e".into(), "console.error('boom: missing API key'); process.exit(3)".into()],
        env: Default::default(),
        cwd: None,
    };
    let error = connect(&spec).await.unwrap_err();
    let CoreError::StartupFailed { stderr_tail, .. } = &error else { panic!("expected StartupFailed, got {error:?}") };
    assert!(stderr_tail.iter().any(|l| l.contains("boom: missing API key")), "{stderr_tail:?}");
}

#[tokio::test]
async fn consent_must_match_the_spawned_command() {
    let consent = SpawnConsent::granted_for(&everything());
    let mut other = everything();
    other.args.push("--extra".into());
    let error = connect_stdio(&other, &consent, SessionOptions::default()).await.unwrap_err();
    assert!(matches!(error, CoreError::ConsentMismatch), "{error:?}");
}
