"""The Claude Agent SDK provider, without spawning the CLI.

`claude_agent_sdk.query` is replaced with a fake that records the options it was
given and yields a canned ResultMessage, so what is tested is our side of the
seam: which prompts, schemas and tools go in, and how the result is validated.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app.analysis.agent import AgentAnalyzer, AgentExtractor
from app.analysis.base import AnalysisFailed
from app.analysis.extract import CaptureInput, ExistingConcept
from app.query import Vocabulary

TODAY = date(2026, 9, 12)


@dataclass
class FakeResult:
    structured_output: Any = None
    result: str | None = None
    is_error: bool = False
    subtype: str = "success"
    stop_reason: str | None = "end_turn"
    errors: list[str] | None = None


@pytest.fixture
def agent(monkeypatch):
    """Patches the SDK so `query` yields what the test scripts, and records calls."""
    import claude_agent_sdk

    calls: list[dict] = []
    replies: list[FakeResult] = []

    async def fake_query(*, prompt, options=None, transport=None):
        calls.append({"prompt": prompt, "options": options})
        reply = replies.pop(0) if replies else FakeResult()
        # Same class the real loop isinstance-checks against.
        yield claude_agent_sdk.ResultMessage(
            subtype=reply.subtype,
            duration_ms=1,
            duration_api_ms=1,
            is_error=reply.is_error,
            num_turns=1,
            session_id="s",
            stop_reason=reply.stop_reason,
            total_cost_usd=0.0,
            usage=None,
            result=reply.result,
            structured_output=reply.structured_output,
            errors=reply.errors,
        )

    monkeypatch.setattr(claude_agent_sdk, "query", fake_query)
    return calls, replies


async def test_interpret_hands_over_the_vocabulary_and_the_date(agent):
    calls, replies = agent
    replies.append(
        FakeResult(structured_output={"subjects": ["Biology"], "logged_after": "2026-06-12"})
    )

    query = await AgentAnalyzer("claude-opus-5").interpret(
        "biology from the past 3 months", TODAY, Vocabulary(subjects=["Biology"])
    )

    assert query.subjects == ["Biology"]
    assert query.logged_after == date(2026, 6, 12)
    assert "Today is 2026-09-12" in calls[0]["prompt"]
    assert "Biology" in calls[0]["prompt"]


async def test_summarise_returns_the_text(agent):
    calls, replies = agent
    replies.append(FakeResult(result="Three of four are concept gaps."))

    text = await AgentAnalyzer("claude-opus-5").summarise("what am I worst at", "digest")
    assert text == "Three of four are concept gaps."
    assert calls[0]["options"].output_format is None


async def test_a_picture_is_written_to_disk_for_the_agent_to_read(agent, tmp_path):
    calls, replies = agent
    replies.append(FakeResult(structured_output={"summary": "ok", "concepts": []}))
    scratch = tmp_path / "scratch"
    scratch.mkdir()

    extractor = AgentExtractor("claude-opus-5", mkdtemp=lambda: str(scratch))
    await extractor.extract(
        CaptureInput(
            kind="image",
            media_type="image/png",
            data=b"\x89PNG fake",
            existing=[ExistingConcept(id="1", title="Chain rule")],
        )
    )

    [call] = calls
    options = call["options"]
    assert options.allowed_tools == ["Read"]
    assert options.permission_mode == "bypassPermissions"
    assert options.cwd == str(scratch)
    assert str(scratch / "notes.png") in call["prompt"]
    assert "Chain rule" in call["prompt"]
    # Cleaned up afterwards: the file and the directory it was written in.
    assert not scratch.exists()


async def test_text_goes_in_the_prompt_with_no_tools(agent):
    calls, replies = agent
    replies.append(
        FakeResult(
            structured_output={
                "summary": "ok",
                "concepts": [{"title": "Osmosis", "body": "water moves", "subject": "Biology"}],
            }
        )
    )

    result = await AgentExtractor("claude-opus-5").extract(
        CaptureInput(kind="audio", text="osmosis is water moving")
    )
    assert result.concepts[0].title == "Osmosis"
    assert calls[0]["options"].allowed_tools == []
    assert calls[0]["prompt"].startswith("Transcript of the recording")


async def test_an_agent_error_is_an_analysis_failure(agent):
    _, replies = agent
    replies.append(FakeResult(is_error=True, subtype="error", errors=["not logged in"]))
    with pytest.raises(AnalysisFailed, match="not logged in"):
        await AgentAnalyzer("claude-opus-5").summarise("q", "d")


async def test_output_that_breaks_the_schema_is_a_failure_not_a_crash(agent):
    """A provider that returns nonsense must surface as a failure, not a traceback."""
    _, replies = agent
    replies.append(FakeResult(structured_output={"sort": "not_a_sort"}))
    with pytest.raises(AnalysisFailed):
        await AgentAnalyzer("claude-opus-5").interpret("show me everything", TODAY, Vocabulary())


async def test_the_provider_is_selectable(monkeypatch):
    from app import config
    from app.analysis import get_analyzer
    from app.analysis.extract import get_extractor

    monkeypatch.setenv("AI_PROVIDER", "agent")
    config.get_settings.cache_clear()
    get_analyzer.cache_clear()
    try:
        assert get_analyzer().name == "agent"
        assert get_extractor().name == "agent"
    finally:
        config.get_settings.cache_clear()
        get_analyzer.cache_clear()


def test_the_temp_file_suffix_follows_the_media_type():
    from app.analysis.agent import _SUFFIX

    assert _SUFFIX["application/pdf"] == ".pdf"
    assert Path("notes" + _SUFFIX["image/jpeg"]).suffix == ".jpg"
