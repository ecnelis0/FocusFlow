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


# What the page sends back for each concept, including the order the reading gave it.
KEPT = ("title", "body", "subject", "parent_title", "order", "when", "existing_id")


async def approve(client, proposal: dict, **overrides) -> dict:
    """Send the proposal back as-is, the way the page does when nothing is edited."""
    body = {
        "concepts": [
            {
                k: c[k]
                for k in KEPT
            }
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
            {
                k: c[k]
                for k in KEPT
            }
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
        assert q["source"] == "Video: Derivatives, lecture 3"
        assert q["tags"] == ["practice"]
        assert [c["id"] for c in q["concepts"]] == [chain_id]

    # Really in the bank, and the concept counts it.
    assert len((await client.get("/mistakes")).json()) == 2
    concept = (await client.get(f"/concepts/{chain_id}")).json()
    assert concept["question_count"] == 2


async def test_every_concept_is_proposed_with_a_position_in_the_order(client):
    """A map that reads in an order needs every concept to have one, not some."""
    response = await client.post("/capture", data={"text": NOTES})
    concepts = response.json()["concepts"]

    assert len(concepts) >= 2
    assert all(c["order"] >= 1 for c in concepts), [c["order"] for c in concepts]
    # Offline the order is the order the material was written in.
    assert [c["title"] for c in sorted(concepts, key=lambda c: c["order"])] == [
        c["title"] for c in concepts
    ]


async def test_approving_files_the_order_onto_the_concepts(client):
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    await approve(client, proposal)

    filed = {c["title"]: c for c in (await client.get("/concepts")).json()}
    for proposed in proposal["concepts"]:
        assert filed[proposed["title"]]["sequence"] == proposed["order"]


async def test_a_concepts_order_survives_being_mentioned_again(client):
    """A later video touching a concept in passing must not renumber it.

    The sequence of a branch is built from the material it came from. Letting any
    subsequent capture overwrite it would mean the order of a folder quietly
    depended on which video was uploaded last.
    """
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    await approve(client, proposal)
    before = {c["title"]: c["sequence"] for c in (await client.get("/concepts")).json()}

    # The same concept again, this time claiming a different position.
    again = (await client.post("/capture", data={"text": NOTES})).json()
    await approve(
        client,
        again,
        concepts=[
            {
                "title": c["title"],
                "body": c["body"],
                "subject": c["subject"],
                "parent_title": c["parent_title"],
                "order": 99,
                "when": "1999",
                "existing_id": c["existing_id"],
            }
            for c in again["concepts"]
        ],
    )

    after = {c["title"]: c["sequence"] for c in (await client.get("/concepts")).json()}
    assert after == before, "a re-capture renumbered concepts that already had an order"


async def test_a_concept_with_no_order_yet_can_be_given_one(client):
    """The other half of that rule: keeping an order is not refusing to gain one."""
    created = await client.post("/concepts", json={"title": "Osmosis", "body": "Water moves."})
    assert created.status_code == 201, created.text
    assert created.json()["sequence"] is None

    response = await client.post("/capture", data={"text": "Osmosis: water follows solute."})
    proposal = response.json()
    await approve(
        client,
        proposal,
        concepts=[
            {
                "title": "Osmosis",
                "body": "Water follows solute.",
                "subject": None,
                "parent_title": None,
                "order": 3,
                "when": "Step 3",
                "existing_id": created.json()["id"],
            }
        ],
    )

    filed = next(c for c in (await client.get("/concepts")).json() if c["title"] == "Osmosis")
    assert filed["sequence"] == 3
    assert filed["when_label"] == "Step 3"


async def test_a_filed_questions_timestamp_survives_the_round_trip_as_utc(
    client, session_factory
):
    """SQLite stores no offset; every timestamp must still come back UTC-aware.

    `UtcDateTime` exists because a naive value read back from the database raises
    the moment it meets a freshly built aware one. This used to be asserted on a
    hand-logged mistake; capture is the only way a question is created now.
    """
    from datetime import datetime, timedelta

    from app.models import Mistake

    notes = "Osmosis: water follows solute.\nWhich way? Answer: Toward the solute."
    proposal = (await client.post("/capture", data={"text": notes})).json()
    result = await approve(client, proposal, questions=[
        {
            "question_text": q["question_text"],
            "correct_answer": q["correct_answer"],
            "concept_titles": [q["concept_title"]],
            "origin": q["origin"],
        }
        for q in proposal["questions"]
    ])
    assert result["questions"], "the capture filed no question to check"
    question_id = result["questions"][0]["id"]

    async with session_factory() as session:
        stored = await session.get(Mistake, question_id)
        assert stored.created_at.tzinfo is not None
        assert stored.created_at.utcoffset() == timedelta(0)

    body = (await client.get(f"/mistakes/{question_id}")).json()
    assert body["created_at"].endswith("Z") or body["created_at"].endswith("+00:00")
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None


async def test_a_filed_question_says_which_material_it_came_out_of(client):
    """Without this on the wire a folder lists every question twice.

    The folder page draws the materials it holds, then any question moved into
    it on its own. Telling those apart needs `material_id` on the question —
    left off the schema, every question looked like a stray and appeared both
    inside its material and again underneath it.
    """
    notes = NOTES + "\nWhat is u? Answer: the simpler one."
    proposal = (await client.post("/capture", data={"text": notes})).json()
    result = await approve(client, proposal, questions=[
        {
            "question_text": q["question_text"],
            "correct_answer": q["correct_answer"],
            "concept_titles": [q["concept_title"]],
            "origin": q["origin"],
        }
        for q in proposal["questions"]
    ])

    assert result["material_id"], "the commit filed no material"
    assert result["questions"], "the commit filed no question"
    for question in result["questions"]:
        assert question["material_id"] == result["material_id"]

    # And it survives being read back, not just returned from the commit.
    fetched = (await client.get(f"/mistakes/{result['questions'][0]['id']}")).json()
    assert fetched["material_id"] == result["material_id"]


async def test_notes_are_written_once_and_kept(client):
    """A revision page that rewrites itself is one you cannot come back to.

    So the second call hands back the first call's page rather than paying for
    another one and handing over something subtly different.
    """
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    filed = await approve(client, proposal)
    material_id = filed["material_id"]

    first = await client.post(f"/materials/{material_id}/notes")
    assert first.status_code == 200, first.text
    assert first.json()["sections"], "the writer produced no sections"

    again = await client.post(f"/materials/{material_id}/notes")
    assert again.json() == first.json()

    # And it is readable without writing it again.
    read = await client.get(f"/materials/{material_id}/notes")
    assert read.json() == first.json()

    # The listing says it has them, so a page can offer to open rather than write.
    [listed] = [m for m in (await client.get("/materials")).json() if m["id"] == material_id]
    assert listed["has_notes"] is True


async def test_notes_are_not_offered_for_a_material_that_filed_nothing(client):
    """Writing a page out of nothing would invent it, which is the one thing
    these notes must not do."""
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    filed = await approve(client, proposal, concepts=[], questions=[
        {
            "question_text": "Standing alone?",
            "correct_answer": "Yes",
            "concept_titles": [],
            "origin": "material",
        }
    ])

    response = await client.post(f"/materials/{filed['material_id']}/notes")
    assert response.status_code == 422
    assert "nothing filed" in response.json()["detail"]


async def test_a_capture_with_no_folder_still_files_its_material_under_a_subject(client):
    """Otherwise the material never appears under the course just typed.

    The folder decides the subject when there is one. With no folder the typed
    steer has to, or `GET /materials?subject=...` answers with nothing and the
    bank shows an empty subject holding something.
    """
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    filed = await approve(client, proposal, subject="Calculus")

    [material] = [
        m for m in (await client.get("/materials")).json() if m["id"] == filed["material_id"]
    ]
    assert material["subject"] == "Calculus"
    assert [m["id"] for m in (await client.get("/materials?subject=Calculus")).json()] == [
        filed["material_id"]
    ]


async def test_a_folder_still_beats_a_typed_subject_for_the_material(client):
    """The folder is authoritative; a subject typed beside it does not overrule it."""
    subject = (await client.post("/subjects", json={"name": "APUSH"})).json()
    folder = (
        await client.post(f"/subjects/{subject['id']}/folders", json={"name": "Unit 3"})
    ).json()
    folder_id = folder["folders"][0]["id"]

    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    filed = await approve(
        client, proposal, folder_id=folder_id, subject="Something else entirely"
    )

    [material] = [
        m for m in (await client.get("/materials")).json() if m["id"] == filed["material_id"]
    ]
    assert material["subject"] == "APUSH"
    assert material["folder_id"] == folder_id
