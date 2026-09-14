"""Answering a review and being marked by the server, not by yourself."""

from __future__ import annotations

from app.models import Mistake
from app.routers.reviews import is_correct
from tests.conftest import MATH_MISTAKE


def _mistake(correct: str, choices: list[str] | None = None) -> Mistake:
    return Mistake(question_text="q", your_answer="?", correct_answer=correct, choices=choices)


def test_marking_forgives_case_spacing_and_notation():
    assert is_correct(" 36 π ", _mistake("36π"))
    assert is_correct("36 pi", _mistake("36π"))
    assert is_correct("x^2 + 1", _mistake("x² + 1"))
    assert is_correct("Triple Alliance.", _mistake("Triple Alliance"))
    assert not is_correct("36", _mistake("36π"))
    assert not is_correct("", _mistake("36π"))


def test_a_choice_can_be_given_as_its_letter_or_its_text():
    mistake = _mistake("mitochondrion", ["nucleus", "ribosome", "mitochondrion", "chloroplast"])
    assert is_correct("C", mistake)
    assert is_correct("c", mistake)
    assert is_correct("Mitochondrion", mistake)
    assert not is_correct("A", mistake)
    assert not is_correct("chloroplast", mistake)
    # And when the stored answer is itself a letter, the text of that choice counts.
    lettered = _mistake("B", ["3", "5", "7", "15"])
    assert is_correct("5", lettered)
    assert is_correct("b", lettered)
    assert not is_correct("7", lettered)


async def _log_and_due(client, monkeypatch):
    """Log a question, then pull its first rung forward so it is due now."""
    from datetime import timedelta

    from sqlalchemy import update

    from app.db import get_sessionmaker
    from app.models import ReviewEvent, utcnow

    logged = await client.post("/mistakes?analyze=false", json=MATH_MISTAKE)
    assert logged.status_code == 201
    mistake_id = logged.json()["id"]
    async with get_sessionmaker()() as session:
        await session.execute(
            update(ReviewEvent)
            .where(ReviewEvent.mistake_id == mistake_id, ReviewEvent.step_index == 0)
            .values(due_at=utcnow() - timedelta(minutes=1))
        )
        await session.commit()
    due = await client.get("/reviews/due")
    [item] = [d for d in due.json() if d["mistake"]["id"] == mistake_id]
    return mistake_id, item["review"]["id"]


async def test_a_right_answer_is_marked_correct_and_keeps_the_ladder(client, monkeypatch):
    mistake_id, review_id = await _log_and_due(client, monkeypatch)

    response = await client.post(f"/reviews/{review_id}/answer", json={"answer": " 5 "})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["correct"] is True
    assert body["review"]["outcome"] == "correct"
    assert body["ladder_restarted"] is False
    assert body["correct_answer"] == MATH_MISTAKE["correct_answer"]
    assert body["your_answer"] == "5"

    mistake = (await client.get(f"/mistakes/{mistake_id}")).json()
    assert sum(1 for r in mistake["reviews"] if r["outcome"] == "correct") == 1
    assert max(r["cycle"] for r in mistake["reviews"]) == 0


async def test_a_wrong_answer_restarts_the_ladder(client, monkeypatch):
    mistake_id, review_id = await _log_and_due(client, monkeypatch)

    response = await client.post(f"/reviews/{review_id}/answer", json={"answer": "7"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["correct"] is False
    assert body["review"]["outcome"] == "wrong"
    assert body["ladder_restarted"] is True
    assert body["correct_answer"] == "5"

    mistake = (await client.get(f"/mistakes/{mistake_id}")).json()
    assert max(r["cycle"] for r in mistake["reviews"]) == 1
    assert sum(1 for r in mistake["reviews"] if r["outcome"] == "superseded") == 4

    # Answered once; a second answer is refused rather than double-counted.
    again = await client.post(f"/reviews/{review_id}/answer", json={"answer": "5"})
    assert again.status_code == 409


async def test_the_assistant_gets_the_whole_bank_as_context(client, monkeypatch):
    from app import query as query_module
    from app.analysis import get_analyzer

    await client.post("/mistakes?analyze=false", json=MATH_MISTAKE)
    concept = await client.post(
        "/concepts", json={"title": "Solve for x, then check", "subject": "Math", "body": "isolate"}
    )
    assert concept.status_code == 201

    seen: dict = {}
    analyzer = get_analyzer()
    original = analyzer.summarise

    async def spy(question, digest, context=""):
        seen["context"] = context
        return await original(question, digest, context)

    monkeypatch.setattr(analyzer, "summarise", spy)
    response = await client.post("/ask", json={"question": "what am I worst at"})
    assert response.status_code == 200
    context = seen["context"]
    assert "BANK TOTALS: 1 questions, 1 concepts" in context
    assert "Solve for x, then check | Math | 0 | isolate" in context
    assert "3x + 7 = 22" in context
    assert "reviews=none yet" in context
    assert query_module.bank_context  # the function the router calls
