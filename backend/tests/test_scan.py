"""Reading a picture of a question into the log form.

The endpoint answers with what the model read and writes nothing, so the tests
here are about the seam either side of that: what the bytes are decided to be on
the way in, and that a read never becomes a row on the way out.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.analysis.base import AnalysisFailed
from app.analysis.scan import ScanInput, ScannedQuestion, StubScanner, get_scanner

SCANNED = {
    "question_text": "If 3x + 7 = 22, what is the value of x?",
    "choices": ["A. 3", "B. 5", "C. 7", "D. 15"],
    "correct_answer": "B",
    "subject": "SAT Math",
    "source": "SAT Question Bank, ID ed314256",
    "note": None,
}


def png(size=(60, 40), colour="red") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, "PNG")
    return buffer.getvalue()


@pytest.fixture
def agent(monkeypatch):
    """Replaces `claude_agent_sdk.query` with a recorder, as in test_agent_provider.

    Local rather than shared: the point of these tests is our side of the seam,
    and a fixture in conftest would be reached for by tests that should be
    hitting the real thing.
    """
    import claude_agent_sdk

    calls: list[dict] = []
    replies: list[FakeStructured] = []

    async def fake_query(*, prompt, options=None, transport=None):
        calls.append({"prompt": prompt, "options": options})
        reply = replies.pop(0) if replies else FakeStructured(None)
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


# --- the endpoint -------------------------------------------------------------


async def test_a_picture_is_read_and_nothing_is_written(client):
    """The whole point: a scan fills a form, it does not log a question."""
    response = await client.post("/mistakes/scan", files={"file": ("q.png", png(), "image/png")})
    assert response.status_code == 200, response.text

    bank = await client.get("/mistakes")
    assert bank.json() == []


async def test_the_offline_reader_says_so_instead_of_inventing_fields(client):
    """With no provider set, the read comes back empty and explains itself.

    A blank question with a note is what the form keys off to refuse the fill; a
    stub that returned plausible-looking text would be filed as if it were real.
    """
    response = await client.post("/mistakes/scan", files={"file": ("q.png", png(), "image/png")})
    body = response.json()
    assert body["question_text"] == ""
    assert "cannot see pictures" in body["note"]


async def test_a_pdf_is_recognised_from_its_bytes(client):
    response = await client.post(
        "/mistakes/scan", files={"file": ("page.pdf", b"%PDF-1.4 fake", "application/pdf")}
    )
    assert response.status_code == 200, response.text


async def test_the_declared_type_is_not_trusted(client):
    """A text file claiming to be a PNG is refused on its bytes, not its header."""
    response = await client.post(
        "/mistakes/scan", files={"file": ("q.png", b"just some text", "image/png")}
    )
    assert response.status_code == 415
    assert "not a picture we can read" in response.json()["detail"]


async def test_an_empty_file_is_refused(client):
    response = await client.post("/mistakes/scan", files={"file": ("q.png", b"", "image/png")})
    assert response.status_code == 422
    assert "empty" in response.json()["detail"]


async def test_an_oversized_picture_is_refused(client, monkeypatch):
    from app.routers import mistakes

    monkeypatch.setattr(mistakes, "MAX_BYTES", 100)
    response = await client.post(
        "/mistakes/scan", files={"file": ("q.png", png(size=(400, 400)), "image/png")}
    )
    assert response.status_code == 422
    assert "limit" in response.json()["detail"]


async def test_a_reader_failure_is_a_502_with_the_reason(client, monkeypatch):
    """A dead CLI or a refusal must name itself, not surface as a 500."""
    from app.routers import mistakes

    class Broken:
        name = "broken"

        async def read(self, scan):
            raise AnalysisFailed("the agent returned no result")

    monkeypatch.setattr(mistakes, "get_scanner", lambda: Broken())
    response = await client.post("/mistakes/scan", files={"file": ("q.png", png(), "image/png")})
    assert response.status_code == 502
    assert "the agent returned no result" in response.json()["detail"]


async def test_the_subject_hint_reaches_the_reader(client, monkeypatch):
    from app.routers import mistakes

    seen: list[ScanInput] = []

    class Recording:
        name = "recording"

        async def read(self, scan):
            seen.append(scan)
            return ScannedQuestion(**SCANNED)

    monkeypatch.setattr(mistakes, "get_scanner", lambda: Recording())
    response = await client.post(
        "/mistakes/scan",
        files={"file": ("q.png", png(), "image/png")},
        data={"subject": "  Chemistry  "},
    )

    assert response.status_code == 200, response.text
    assert response.json()["correct_answer"] == "B"
    assert seen[0].subject_hint == "Chemistry"
    assert seen[0].kind == "image"
    assert seen[0].media_type == "image/png"


# --- the reader itself --------------------------------------------------------


async def test_the_stub_never_guesses_at_a_question():
    scanned = await StubScanner().read(
        ScanInput(kind="image", media_type="image/png", data=png(), subject_hint="Biology")
    )
    assert scanned.question_text == ""
    assert scanned.correct_answer is None
    assert scanned.subject == "Biology"


def test_the_provider_decides_the_reader(monkeypatch):
    from app import config

    monkeypatch.setenv("AI_PROVIDER", "agent")
    config.get_settings.cache_clear()
    assert get_scanner().name == "agent"

    monkeypatch.setenv("AI_PROVIDER", "stub")
    config.get_settings.cache_clear()
    assert get_scanner().name == "stub"
    config.get_settings.cache_clear()


def test_an_unknown_provider_falls_back_to_the_stub(monkeypatch):
    """Unlike the analyzer, a bad provider here must not take the page down.

    The form still works without a reader; refusing to start would be worse.
    """
    from app import config

    monkeypatch.setenv("AI_PROVIDER", "nonsense")
    config.get_settings.cache_clear()
    assert get_scanner().name == "stub"
    config.get_settings.cache_clear()


async def test_correct_answer_is_optional_in_the_schema():
    """A picture with no answer key still fills the question and the choices."""
    scanned = ScannedQuestion(question_text="q", choices=["A. 1", "B. 2"])
    assert scanned.correct_answer is None

    schema = ScannedQuestion.model_json_schema()
    assert set(schema["required"]) == {"question_text"}


# --- the agent adapter --------------------------------------------------------


async def test_the_picture_is_written_to_disk_for_the_agent_to_read(agent, tmp_path):
    """Same route as the extractor: a file the CLI's Read tool opens, then cleaned up."""
    from app.analysis.agent import AgentScanner

    calls, replies = agent
    replies.append(FakeStructured(SCANNED))
    scratch = tmp_path / "scratch"
    scratch.mkdir()

    scanner = AgentScanner("claude-opus-5", mkdtemp=lambda: str(scratch))
    scanned = await scanner.read(
        ScanInput(kind="image", media_type="image/png", data=png(), subject_hint="SAT Math")
    )

    assert scanned.correct_answer == "B"
    [call] = calls
    options = call["options"]
    assert options.allowed_tools == ["Read"]
    assert options.permission_mode == "bypassPermissions"
    assert options.cwd == str(scratch)
    assert str(scratch / "question.png") in call["prompt"]
    assert "SAT Math" in call["prompt"]
    assert "question_text" in options.output_format["schema"]["properties"]
    # The temporary file and its directory do not outlive the read.
    assert not scratch.exists()


async def test_the_agent_refuses_a_format_the_cli_cannot_open(agent):
    from app.analysis.agent import AgentScanner

    with pytest.raises(AnalysisFailed, match="image/tiff"):
        await AgentScanner("claude-opus-5").read(
            ScanInput(kind="image", media_type="image/tiff", data=b"II*\x00")
        )


class FakeStructured:
    """Shaped like the FakeResult in test_agent_provider, for the shared fixture."""

    def __init__(self, structured_output):
        self.structured_output = structured_output
        self.result = None
        self.is_error = False
        self.subtype = "success"
        self.stop_reason = "end_turn"
        self.errors = None
