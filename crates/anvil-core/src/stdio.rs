//! Spawning local MCP servers over stdio: consent, a minimal environment, command resolution and stderr capture.

use std::{
    collections::{BTreeMap, VecDeque},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};

#[cfg(unix)]
use process_wrap::tokio::ProcessGroup;
use process_wrap::tokio::{CommandWrap, KillOnDrop};
#[cfg(windows)]
use process_wrap::tokio::{CreationFlags, JobObject};
use rmcp::transport::TokioChildProcess;
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::{ChildStderr, Command},
};

use crate::{CoreError, McpSession, SessionOptions};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StdioSpec {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub cwd: Option<PathBuf>,
}

/// Evidence that the user approved spawning exactly this spec. Build it only in response to an explicit user action.
#[derive(Debug, Clone)]
pub struct SpawnConsent {
    approved: StdioSpec,
}

impl SpawnConsent {
    pub fn granted_for(spec: &StdioSpec) -> Self {
        Self { approved: spec.clone() }
    }

    pub fn covers(&self, spec: &StdioSpec) -> bool {
        &self.approved == spec
    }
}

// Mirrors the default environment the official MCP SDKs pass to stdio servers.
#[cfg(windows)]
const INHERITED_ENV: &[&str] = &[
    "APPDATA",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROGRAMFILES",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];
#[cfg(not(windows))]
const INHERITED_ENV: &[&str] = &["HOME", "LANG", "LOGNAME", "PATH", "SHELL", "TERM", "TMPDIR", "USER"];

/// The environment a spawned server gets: the allowlist from `parent`, then the user's explicit variables on top.
/// Secrets in the parent environment (API keys, cloud credentials) are not inherited.
pub fn child_env(spec: &StdioSpec, parent: impl IntoIterator<Item = (String, String)>) -> BTreeMap<String, String> {
    let mut env: BTreeMap<String, String> = parent
        .into_iter()
        .filter(|(name, value)| {
            INHERITED_ENV.iter().any(|allowed| allowed.eq_ignore_ascii_case(name)) && !value.starts_with("()")
        })
        .collect();
    env.extend(spec.env.iter().map(|(k, v)| (k.clone(), v.clone())));
    env
}

/// Finds the executable, including Windows `.cmd`/`.bat` shims such as `npx.cmd` via PATHEXT.
pub fn resolve_command(command: &str, path_var: Option<&str>, cwd: &Path) -> Result<PathBuf, CoreError> {
    which::which_in(command, path_var, cwd).map_err(|_| CoreError::CommandNotFound(command.to_owned()))
}

const STDERR_MAX_LINES: usize = 200;
const STDERR_MAX_LINE_BYTES: usize = 2048;
const STDERR_MAX_READ: u64 = 64 * 1024;

/// The last lines a server wrote to stderr, bounded so a noisy server cannot exhaust memory.
#[derive(Debug, Clone, Default)]
pub struct StderrTail(Arc<Mutex<VecDeque<String>>>);

impl StderrTail {
    pub fn push(&self, mut line: String) {
        if line.len() > STDERR_MAX_LINE_BYTES {
            let mut cut = STDERR_MAX_LINE_BYTES;
            while !line.is_char_boundary(cut) {
                cut -= 1;
            }
            line.truncate(cut);
            line.push('…');
        }
        let mut lines = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if lines.len() == STDERR_MAX_LINES {
            lines.pop_front();
        }
        lines.push_back(line);
    }

    pub fn lines(&self) -> Vec<String> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).iter().cloned().collect()
    }
}

fn capture_stderr(stderr: ChildStderr, tail: StderrTail) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match (&mut reader).take(STDERR_MAX_READ).read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => tail.push(String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_owned()),
            }
        }
    });
}

/// Launchers (`npx.cmd`, `sh -c`, `uvx`) start the real server as a grandchild. Killing only the direct child would
/// leave it running with no window, so the whole tree goes in a Windows Job Object or a Unix process group, and is
/// killed when the session closes or when Anvil itself exits or crashes.
fn whole_tree(command: Command) -> CommandWrap {
    let mut wrapped = CommandWrap::from(command);
    wrapped.wrap(KillOnDrop);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: no console window flashes up. Set through the wrapper so JobObject keeps it.
        wrapped.wrap(CreationFlags(windows::Win32::System::Threading::CREATE_NO_WINDOW));
        wrapped.wrap(JobObject);
    }
    #[cfg(unix)]
    wrapped.wrap(ProcessGroup::leader());
    wrapped
}

#[derive(Debug, Clone)]
pub struct ProcessInfo {
    pub pid: Option<u32>,
    pub stderr: StderrTail,
}

#[derive(Debug)]
pub struct StdioConnection {
    pub session: McpSession,
    pub process: ProcessInfo,
}

pub async fn connect_stdio(
    spec: &StdioSpec,
    consent: &SpawnConsent,
    options: SessionOptions,
) -> Result<StdioConnection, CoreError> {
    if !consent.covers(spec) {
        return Err(CoreError::ConsentMismatch);
    }
    let cwd = match &spec.cwd {
        Some(dir) => dir.clone(),
        None => std::env::current_dir()?,
    };
    let env = child_env(spec, std::env::vars());
    let path_var = env.iter().find(|(name, _)| name.eq_ignore_ascii_case("PATH")).map(|(_, v)| v.as_str());
    let program = resolve_command(&spec.command, path_var, &cwd)?;

    let mut command = Command::new(program);
    command.args(&spec.args).env_clear().envs(&env).current_dir(&cwd);

    let (transport, stderr) = TokioChildProcess::builder(whole_tree(command)).stderr(Stdio::piped()).spawn()?;
    let pid = transport.id();
    let tail = StderrTail::default();
    if let Some(stderr) = stderr {
        capture_stderr(stderr, tail.clone());
    }

    match McpSession::connect_with(transport, options).await {
        Ok(session) => Ok(StdioConnection { session, process: ProcessInfo { pid, stderr: tail } }),
        Err(timeout @ CoreError::Timeout { .. }) => Err(timeout),
        Err(other) => {
            // Let the stderr reader drain what the process printed before it died.
            tokio::time::sleep(Duration::from_millis(200)).await;
            Err(CoreError::StartupFailed { reason: other.to_string(), stderr_tail: tail.lines() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> StdioSpec {
        StdioSpec { command: "node".into(), args: vec!["server.js".into()], env: BTreeMap::new(), cwd: None }
    }

    #[test]
    fn consent_covers_only_the_exact_spec() {
        let consent = SpawnConsent::granted_for(&spec());
        assert!(consent.covers(&spec()));
        let mut other = spec();
        other.args.push("--evil".into());
        assert!(!consent.covers(&other));
    }

    #[test]
    fn child_env_keeps_the_allowlist_and_drops_secrets() {
        let parent = [
            ("PATH".to_string(), "/usr/bin".to_string()),
            ("AWS_SECRET_ACCESS_KEY".to_string(), "hunter2".to_string()),
            ("OPENAI_API_KEY".to_string(), "sk-live".to_string()),
        ];
        let env = child_env(&spec(), parent);
        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin"));
        assert!(!env.contains_key("AWS_SECRET_ACCESS_KEY"));
        assert!(!env.contains_key("OPENAI_API_KEY"));
    }

    #[test]
    fn child_env_matches_allowlisted_names_case_insensitively() {
        let env = child_env(&spec(), [("Path".to_string(), "C:\\Windows".to_string())]);
        assert_eq!(env.get("Path").map(String::as_str), Some("C:\\Windows"));
    }

    #[test]
    fn child_env_skips_exported_shell_functions() {
        let env = child_env(&spec(), [("PATH".to_string(), "() { :; }; echo pwned".to_string())]);
        assert!(!env.contains_key("PATH"));
    }

    #[test]
    fn user_env_is_passed_and_overrides_the_parent() {
        let mut s = spec();
        s.env.insert("PATH".into(), "/custom".into());
        s.env.insert("GITHUB_TOKEN".into(), "explicitly-provided".into());
        let env = child_env(&s, [("PATH".to_string(), "/usr/bin".to_string())]);
        assert_eq!(env.get("PATH").map(String::as_str), Some("/custom"));
        assert_eq!(env.get("GITHUB_TOKEN").map(String::as_str), Some("explicitly-provided"));
    }

    #[test]
    fn resolves_commands_on_path_and_names_missing_ones() {
        let cwd = std::env::current_dir().unwrap();
        let path = std::env::var("PATH").ok();
        assert!(resolve_command("node", path.as_deref(), &cwd).is_ok(), "node must be on PATH for tests");
        let error = resolve_command("anvil-definitely-not-installed", path.as_deref(), &cwd).unwrap_err();
        assert!(matches!(&error, CoreError::CommandNotFound(name) if name == "anvil-definitely-not-installed"));
    }

    #[cfg(windows)]
    #[test]
    fn npx_resolves_to_its_cmd_shim() {
        let cwd = std::env::current_dir().unwrap();
        let path = std::env::var("PATH").ok();
        let resolved = resolve_command("npx", path.as_deref(), &cwd).expect("npx on PATH");
        let extension = resolved.extension().and_then(|e| e.to_str()).unwrap_or_default();
        assert!(extension.eq_ignore_ascii_case("cmd"), "resolved to {}", resolved.display());
    }

    #[test]
    fn stderr_tail_keeps_the_last_lines_and_truncates_long_ones() {
        let tail = StderrTail::default();
        for i in 0..(STDERR_MAX_LINES + 5) {
            tail.push(format!("line {i}"));
        }
        let lines = tail.lines();
        assert_eq!(lines.len(), STDERR_MAX_LINES);
        assert_eq!(lines[0], "line 5");

        tail.push("é".repeat(STDERR_MAX_LINE_BYTES));
        let last = tail.lines().pop().unwrap();
        assert!(last.len() <= STDERR_MAX_LINE_BYTES + '…'.len_utf8());
        assert!(last.ends_with('…'));
    }
}
