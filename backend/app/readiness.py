"""Is the selected AI provider actually usable? One answer for /health and /ask."""

from __future__ import annotations

import json
import shutil
import subprocess

from .config import Settings


def agent_logged_in() -> bool:
    """Is the Claude Code CLI installed and signed in? Cheap enough per request."""
    cli = shutil.which("claude")
    if cli is None:
        return False
    try:
        out = subprocess.run([cli, "auth", "status"], capture_output=True, text=True, timeout=10)
        return bool(json.loads(out.stdout).get("loggedIn"))
    except (subprocess.SubprocessError, ValueError, OSError):
        return False


def analyzer_ready(settings: Settings) -> bool:
    provider = settings.ai_provider.lower()
    if provider == "stub":
        return True
    if provider == "claude":
        return bool(settings.anthropic_api_key)
    if provider == "agent":
        return agent_logged_in()
    return False
