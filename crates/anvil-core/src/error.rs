use std::time::Duration;

/// Every failure anvil-core can report. `kind()` is the stable identifier the frontend switches on.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("command not found: {0}")]
    CommandNotFound(String),
    #[error("consent was granted for a different command than the one being spawned")]
    ConsentMismatch,
    #[error("the server failed to start: {reason}")]
    StartupFailed { reason: String, stderr_tail: Vec<String> },
    #[error("timed out after {after:?} waiting for {what}")]
    Timeout { what: &'static str, after: Duration },
    #[error("not connected: the server closed the connection")]
    Disconnected,
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("unexpected data from the server: {0}")]
    InvalidData(String),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
}

impl CoreError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::CommandNotFound(_) => "commandNotFound",
            Self::ConsentMismatch => "consentMismatch",
            Self::StartupFailed { .. } => "startupFailed",
            Self::Timeout { .. } => "timeout",
            Self::Disconnected => "disconnected",
            Self::Protocol(_) => "protocol",
            Self::InvalidData(_) => "invalidData",
            Self::Io(_) => "io",
        }
    }

    pub fn stderr_tail(&self) -> &[String] {
        match self {
            Self::StartupFailed { stderr_tail, .. } => stderr_tail,
            _ => &[],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_are_stable_identifiers_for_the_frontend() {
        let cases = [
            (CoreError::CommandNotFound("x".into()), "commandNotFound"),
            (CoreError::ConsentMismatch, "consentMismatch"),
            (CoreError::StartupFailed { reason: "r".into(), stderr_tail: vec![] }, "startupFailed"),
            (CoreError::Timeout { what: "tools/list", after: Duration::from_secs(1) }, "timeout"),
            (CoreError::Disconnected, "disconnected"),
            (CoreError::Protocol("p".into()), "protocol"),
            (CoreError::InvalidData("d".into()), "invalidData"),
            (CoreError::Io(std::io::Error::other("io")), "io"),
        ];
        for (error, kind) in cases {
            assert_eq!(error.kind(), kind, "{error}");
        }
    }

    #[test]
    fn startup_failures_expose_their_stderr_tail() {
        let error = CoreError::StartupFailed { reason: "exited".into(), stderr_tail: vec!["boom".into()] };
        assert_eq!(error.stderr_tail(), ["boom".to_string()]);
        assert_eq!(error.to_string(), "the server failed to start: exited");
        assert!(CoreError::Disconnected.stderr_tail().is_empty());
    }
}
