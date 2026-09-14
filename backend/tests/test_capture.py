"""Scanning notes and recordings into concepts: propose, edit, approve."""

from __future__ import annotations

import io

import httpx2
import pytest
from PIL import Image

from app.analysis.extract import CaptureInput, ClaudeExtractor, ExistingConcept
from tests.fakes import anthropic_stub

NOTES = """\
Integration by parts: pick u to be the thing that gets simpler when differentiated.
Then v is whatever is left, and the formula is uv minus the integral of v du.

Chain rule: differentiate the outside, keep the inside, multiply by the inside's derivative.
"""


def png(size=(60, 40), colour="red") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, "PNG")
    return buffer.getvalue()


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    from app import config

    directory = tmp_path / "uploads"
    monkeypatch.setenv("UPLOAD_ROOT", str(directory))
    config.get_settings.cache_clear()
    yield directory
    config.get_settings.cache_clear()


async def approve(client, proposal: dict, **overrides) -> dict:
    """Send the proposal back as-is, the way the page does when nothing is edited."""
    body = {
        "concepts": [
            {k: c[k] for k in ("title", "body", "subject", "existing_id")}
            for c in proposal["concepts"]
        ],
        "image_filename": proposal["image_filename"],
        **overrides,
    }
    response = await client.post("/capture/commit", json=body)
    assert response.status_code == 200, response.text
    return response.json()


async def test_pasted_text_is_proposed_not_filed(client):
    response = await client.post("/capture", data={"text": NOTES, "subject": "Calculus"})
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["kind"] == "text"
    assert body["extractor"] == "stub"
    assert body["transcript"] is None
    titles = [c["title"] for c in body["concepts"]]
    assert titles[0].startswith("Integration by parts")
    assert titles[1].startswith("Chain rule")
    assert all(c["subject"] == "Calculus" for c in body["concepts"])
    assert all(c["existing_id"] is None for c in body["concepts"])

    # Nothing in the bank until it is approved.
    assert (await client.get("/concepts")).json() == []


async def test_approving_files_the_concepts_as_edited(client):
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    concepts = proposal["concepts"]
    concepts[0]["title"] = "IBP: u is what gets simpler"
    concepts[0]["body"] = "My own wording."
    concepts[0]["subject"] = "Calculus"
    del concepts[1]  # the student struck one out

    result = await approve(client, {**proposal, "concepts": concepts})
    [change] = result["changes"]
    assert change["action"] == "created"
    assert change["concept"]["title"] == "IBP: u is what gets simpler"
    assert change["concept"]["body"] == "My own wording."
    assert change["concept"]["subject"] == "Calculus"

    listed = (await client.get("/concepts")).json()
    assert [c["title"] for c in listed] == ["IBP: u is what gets simpler"]


async def test_the_same_concept_again_is_proposed_as_a_merge(client):
    first = (
        await client.post("/capture", data={"text": "Chain rule: outside times inside."})
    ).json()
    concept_id = (await approve(client, first))["changes"][0]["concept"]["id"]

    again = (
        await client.post("/capture", data={"text": "Chain rule: and do not forget the inside."})
    ).json()
    [proposed] = again["concepts"]
    assert proposed["existing_id"] == concept_id
    assert proposed["existing_title"] == "Chain rule"

    [change] = (await approve(client, again))["changes"]
    assert change["action"] == "updated"
    assert change["concept"]["id"] == concept_id
    assert "Added from your notes" in change["concept"]["body"]
    assert "do not forget the inside" in change["concept"]["body"]
    assert len((await client.get("/concepts")).json()) == 1


async def test_the_student_can_refuse_a_merge_by_changing_the_title(client):
    first = (
        await client.post("/capture", data={"text": "Chain rule: outside times inside."})
    ).json()
    await approve(client, first)

    again = (await client.post("/capture", data={"text": "Chain rule: second lecture."})).json()
    [proposed] = again["concepts"]
    proposed["existing_id"] = None
    proposed["title"] = "Chain rule, lecture 2"
    [change] = (await approve(client, again))["changes"]
    assert change["action"] == "created"
    assert len((await client.get("/concepts")).json()) == 2


async def test_a_text_file_is_read_as_text(client):
    response = await client.post(
        "/capture", files={"file": ("notes.txt", NOTES.encode(), "text/plain")}
    )
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "text"
    assert len(response.json()["concepts"]) == 2


async def test_a_picture_is_kept_and_attached_on_approval(client, uploads):
    response = await client.post("/capture", files={"file": ("notes.png", png(), "image/png")})
    assert response.status_code == 200, response.text
    proposal = response.json()
    assert proposal["kind"] == "image"
    assert proposal["image_filename"] and proposal["image_filename"] != "notes.png"
    assert (uploads / proposal["image_filename"]).exists()

    [change] = (await approve(client, proposal))["changes"]
    assert change["action"] == "created"
    assert len(change["concept"]["images"]) == 1
    filename = change["concept"]["images"][0]["url"].rsplit("/", 1)[-1]
    assert (uploads / filename).exists()
    # The staging copy is gone; only the attached one remains.
    assert not (uploads / proposal["image_filename"]).exists()


async def test_a_discarded_picture_is_removed(client, uploads):
    proposal = (await client.post("/capture", files={"file": ("n.png", png(), "image/png")})).json()
    assert (uploads / proposal["image_filename"]).exists()
    response = await client.delete(f"/capture/source/{proposal['image_filename']}")
    assert response.status_code == 204
    assert not (uploads / proposal["image_filename"]).exists()
    # A path that tries to escape the upload root never reaches the filesystem.
    assert (await client.delete("/capture/source/..%2F..%2Fetc%2Fpasswd")).status_code in (204, 404)


async def test_the_picture_is_sniffed_not_trusted(client, uploads):
    response = await client.post(
        "/capture", files={"file": ("notes.png", b"Osmosis: water moves to solute.", "image/png")}
    )
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "text"
    assert response.json()["image_filename"] is None


async def test_a_pdf_is_recognised_from_its_bytes(client):
    response = await client.post(
        "/capture", files={"file": ("notes.pdf", b"%PDF-1.4 fake", "application/pdf")}
    )
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "pdf"
    assert response.json()["image_filename"] is None


async def test_a_recording_is_transcribed_first(client):
    spoken = b"Mitochondria make ATP through cellular respiration."
    response = await client.post("/capture", files={"file": ("lecture.webm", spoken, "audio/webm")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kind"] == "audio"
    assert body["transcript"] == spoken.decode()
    assert body["concepts"][0]["title"].startswith("Mitochondria make ATP")


async def test_garbage_is_refused_with_a_reason(client):
    response = await client.post(
        "/capture", files={"file": ("thing.bin", bytes(range(256)) * 4, "application/octet-stream")}
    )
    assert response.status_code == 415
    assert "picture, a PDF, a recording, or plain text" in response.json()["detail"]


async def test_nothing_sent_is_refused(client):
    assert (await client.post("/capture", data={"text": "   "})).status_code == 422
    assert (await client.post("/capture/commit", json={"concepts": []})).status_code == 422


async def test_whisper_missing_is_a_clear_503_not_a_crash(client, monkeypatch):
    from app import config

    monkeypatch.setenv("TRANSCRIBER", "whisper")
    monkeypatch.setitem(__import__("sys").modules, "faster_whisper", None)
    config.get_settings.cache_clear()
    try:
        response = await client.post(
            "/capture", files={"file": ("lecture.mp3", b"\x00\x01\x02", "audio/mpeg")}
        )
    finally:
        config.get_settings.cache_clear()
    assert response.status_code == 503
    assert "uv sync --extra audio" in response.json()["detail"]


# --- the Claude path, against the stand-in endpoint ------------------------------


@pytest.fixture
def extractor():
    anthropic_stub.reset()
    client = httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=anthropic_stub.app),
        base_url="http://anthropic.test",
    )
    yield ClaudeExtractor(
        "sk-ant-test", "claude-opus-5", http_client=client, base_url="http://anthropic.test"
    )


async def test_a_picture_goes_to_claude_as_an_image_block(extractor):
    result = await extractor.extract(
        CaptureInput(
            kind="image",
            media_type="image/png",
            data=png(),
            existing=[ExistingConcept(id="c1", title="Chain rule", subject="Calculus")],
        )
    )
    assert result.summary

    sent = anthropic_stub.seen[-1]
    assert sent["model"] == "claude-opus-5"
    assert sent["thinking"] == {"type": "adaptive"}
    assert sent["output_config"]["format"]["type"] == "json_schema"
    [message] = sent["messages"]
    kinds = [block["type"] for block in message["content"]]
    assert kinds == ["image", "text"]
    assert message["content"][0]["source"]["media_type"] == "image/png"
    # The bank's own concepts reach the prompt, so the model can merge instead of duplicate.
    assert "Chain rule" in message["content"][1]["text"]


async def test_a_pdf_goes_as_a_document_and_a_transcript_as_text(extractor):
    await extractor.extract(CaptureInput(kind="pdf", media_type="application/pdf", data=b"%PDF"))
    assert anthropic_stub.seen[-1]["messages"][0]["content"][0]["type"] == "document"

    await extractor.extract(CaptureInput(kind="audio", text="the spoken words"))
    text = anthropic_stub.seen[-1]["messages"][0]["content"][0]["text"]
    assert text.startswith("Transcript of the recording")
    assert "the spoken words" in text


async def test_a_refusal_is_an_error_not_an_empty_bank(extractor, monkeypatch):
    monkeypatch.setattr(anthropic_stub, "STOP_REASON", "refusal")
    from app.analysis.base import AnalysisFailed

    with pytest.raises(AnalysisFailed):
        await extractor.extract(CaptureInput(kind="text", text="notes"))


# --- practice questions -----------------------------------------------------------

LESSON = """\
Chain rule: differentiate the outside, keep the inside, multiply by the inside's derivative.
What is d/dx of sin(3x)? Answer: 3cos(3x)
What is d/dx of (2x+1)^5? Answer: 10(2x+1)^4

Product rule: (uv)' = u'v + uv'.
Differentiate x·e^x? Answer: e^x + x·e^x
"""


async def test_practice_questions_are_proposed_under_their_concepts(client):
    proposal = (await client.post("/capture", data={"text": LESSON})).json()
    titles = [c["title"] for c in proposal["concepts"]]
    assert titles[0].startswith("Chain rule")
    questions = proposal["questions"]
    assert [q["question_text"] for q in questions] == [
        "What is d/dx of sin(3x)?",
        "What is d/dx of (2x+1)^5?",
        "Differentiate x·e^x?",
    ]
    assert [q["correct_answer"] for q in questions] == ["3cos(3x)", "10(2x+1)^4", "e^x + x·e^x"]
    assert questions[0]["concept_title"] == titles[0]
    assert questions[2]["concept_title"] == titles[1]
    # Proposed only: nothing in the bank yet.
    assert (await client.get("/mistakes")).json() == []


async def test_approved_questions_are_logged_and_tagged_under_their_concepts(client):
    proposal = (await client.post("/capture", data={"text": LESSON})).json()
    body = {
        "concepts": [
            {k: c[k] for k in ("title", "body", "subject", "existing_id")}
            for c in proposal["concepts"]
        ],
        "questions": [
            {
                "question_text": q["question_text"],
                "choices": q["choices"],
                "correct_answer": q["correct_answer"],
                "concept_titles": [q["concept_title"]],
            }
            for q in proposal["questions"][:2]  # the student struck the third out
        ],
        "image_filename": None,
        "source": "Video: Derivatives, lecture 3",
    }
    result = await client.post("/capture/commit", json=body)
    assert result.status_code == 200, result.text
    logged = result.json()["questions"]
    assert len(logged) == 2
    chain_id = next(
        c["concept"]["id"] for c in result.json()["changes"] if "Chain" in c["concept"]["title"]
    )
    for q in logged:
        assert q["your_answer"] == "not attempted yet"
        assert q["analysis_status"] == "not_requested"
        assert q["source"] == "Video: Derivatives, lecture 3"
        assert q["tags"] == ["practice"]
        assert [c["id"] for c in q["concepts"]] == [chain_id]
        # On the ladder from now, so it comes round in Review.
        assert len(q["reviews"]) == 5

    # Really in the bank, and the concept counts it.
    assert len((await client.get("/mistakes")).json()) == 2
    concept = (await client.get(f"/concepts/{chain_id}")).json()
    assert concept["question_count"] == 2

    # And it is answerable in Review, marked by the server.
    from datetime import timedelta

    from sqlalchemy import update

    from app.db import get_sessionmaker
    from app.models import ReviewEvent, utcnow

    async with get_sessionmaker()() as session:
        await session.execute(
            update(ReviewEvent)
            .where(ReviewEvent.mistake_id == logged[0]["id"], ReviewEvent.step_index == 0)
            .values(due_at=utcnow() - timedelta(minutes=1))
        )
        await session.commit()
    due = (await client.get("/reviews/due")).json()
    [item] = [d for d in due if d["mistake"]["id"] == logged[0]["id"]]
    marked = await client.post(
        f"/reviews/{item['review']['id']}/answer", json={"answer": "3 cos(3x)"}
    )
    assert marked.json()["correct"] is True
