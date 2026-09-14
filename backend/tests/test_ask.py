"""The side assistant. The model writes the filter; the database writes the answer."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.analysis.stub import StubAnalyzer
from app.models import Mistake, ReviewEvent
from app.query import BankQuery, Vocabulary, describe
from tests.conftest import BIOLOGY_MISTAKE, MATH_MISTAKE

TODAY = date(2026, 9, 7)


async def _log(client, payload, **overrides):
    mistake_id = (await client.post("/mistakes", json=payload)).json()["id"]
    if overrides:
        assert (await client.patch(f"/mistakes/{mistake_id}", json=overrides)).status_code == 200
    return mistake_id


async def _age(session_factory, mistake_id: str, days: int) -> None:
    """Move a question (and its ladder) back in time, as if logged `days` ago."""
    async with session_factory() as session:
        mistake = await session.get(Mistake, mistake_id)
        mistake.created_at = mistake.created_at - timedelta(days=days)
        events = await session.scalars(
            select(ReviewEvent).where(ReviewEvent.mistake_id == mistake_id)
        )
        for event in events:
            event.due_at = event.due_at - timedelta(days=days)
        await session.commit()


# --- interpreting the sentence ------------------------------------------------


EMPTY_VOCABULARY = Vocabulary()
TWO_SUBJECTS = Vocabulary(subjects=["Biology", "Math"])


async def test_the_students_own_example_becomes_the_right_filter():
    query = await StubAnalyzer().interpret(
        "give me all the questions logged in the past 3 months that are very important "
        "and from the biology category",
        TODAY,
        TWO_SUBJECTS,
    )

    assert query.urgency == ["very_important"]
    assert query.subjects == ["Biology"]
    assert query.logged_after == TODAY - timedelta(days=90)


async def test_a_subject_is_matched_however_it_is_typed_and_copied_as_the_bank_spells_it():
    """Subjects are free text, so the filter carries the bank's own spelling."""
    query = await StubAnalyzer().interpret("my BIOLOGY questions", TODAY, TWO_SUBJECTS)

    assert query.subjects == ["Biology"]


async def test_a_subject_the_bank_does_not_have_is_not_invented():
    query = await StubAnalyzer().interpret("my chemistry questions", TODAY, TWO_SUBJECTS)

    assert query.subjects == []


async def test_very_important_does_not_collapse_into_important():
    """'very important' contains 'important'; the longer phrase has to win."""
    query = await StubAnalyzer().interpret(
        "show me the very important ones", TODAY, EMPTY_VOCABULARY
    )

    assert query.urgency == ["very_important"]


@pytest.mark.parametrize(
    ("phrase", "days"),
    [("the past 3 months", 90), ("the last two weeks", 14), ("the past year", 365)],
)
async def test_relative_dates_resolve_to_absolute_ones(phrase, days):
    query = await StubAnalyzer().interpret(f"what did I log in {phrase}", TODAY, EMPTY_VOCABULARY)

    assert query.logged_after == TODAY - timedelta(days=days)


async def test_a_question_with_no_constraints_searches_everything():
    query = await StubAnalyzer().interpret("what does my bank look like", TODAY, EMPTY_VOCABULARY)

    assert query == BankQuery()
    assert describe(query) == "everything in the bank"


# --- running it ---------------------------------------------------------------


async def test_asking_returns_the_rows_not_a_recollection(client, session_factory):
    wanted = await _log(client, BIOLOGY_MISTAKE, urgency="very_important")
    too_old = await _log(client, BIOLOGY_MISTAKE, urgency="very_important")
    wrong_subject = await _log(client, MATH_MISTAKE, urgency="very_important")
    wrong_urgency = await _log(client, BIOLOGY_MISTAKE, urgency="important")
    await _age(session_factory, too_old, days=200)

    body = (
        await client.post(
            "/ask",
            json={
                "question": "give me all the questions logged in the past 3 months "
                "that are very important and from the biology category"
            },
        )
    ).json()

    assert [m["id"] for m in body["mistakes"]] == [wanted]
    assert wrong_subject not in [m["id"] for m in body["mistakes"]]
    assert wrong_urgency not in [m["id"] for m in body["mistakes"]]
    assert body["error"] is None


async def test_the_answer_shows_what_was_actually_searched(client):
    await _log(client, BIOLOGY_MISTAKE, urgency="very_important")

    body = (
        await client.post(
            "/ask", json={"question": "very important biology from the past 3 months"}
        )
    ).json()

    assert "very important" in body["filter_description"]
    assert "in Biology" in body["filter_description"]
    assert "logged since" in body["filter_description"]
    assert body["query"]["subjects"] == ["Biology"]


async def test_the_vocabulary_lists_the_subjects_the_bank_actually_has(client, session_factory):
    """Without this the model could only guess at how the student spells a subject."""
    from app.query import vocabulary

    await _log(client, MATH_MISTAKE)
    await _log(client, BIOLOGY_MISTAKE)
    await _log(client, {**MATH_MISTAKE, "subject": None})

    async with session_factory() as session:
        words = await vocabulary(session, "local")

    assert words.subjects == ["Biology", "Math"]
    assert "Subjects in this bank: Biology, Math" in words.render()


async def test_a_question_that_matches_nothing_says_so(client):
    await _log(client, MATH_MISTAKE, urgency="important")

    body = (await client.post("/ask", json={"question": "fundamental biology ones"})).json()

    assert body["mistakes"] == []
    assert "No questions matched" in body["answer"]


async def test_asking_only_ever_sees_your_own_bank(client):
    await _log(client, BIOLOGY_MISTAKE, urgency="very_important")

    body = (
        await client.post(
            "/ask", json={"question": "everything"}, headers={"X-User-Id": "someone-else"}
        )
    ).json()

    assert body["mistakes"] == []


async def test_due_now_is_a_thing_you_can_ask_for(client, session_factory):
    due = await _log(client, MATH_MISTAKE)
    await _log(client, BIOLOGY_MISTAKE)
    await _age(session_factory, due, days=1)

    body = (await client.post("/ask", json={"question": "what is due for review now"})).json()

    assert body["query"]["only_due"] is True
    assert [m["id"] for m in body["mistakes"]] == [due]


async def test_a_broken_interpreter_still_hands_back_the_bank(client, monkeypatch):
    from app.routers import ask as ask_router

    class Broken(StubAnalyzer):
        async def interpret(self, question, today, vocabulary):
            raise RuntimeError("provider is down")

    monkeypatch.setattr(ask_router, "get_analyzer", lambda: Broken())
    await _log(client, MATH_MISTAKE)

    body = (await client.post("/ask", json={"question": "anything at all"})).json()

    assert len(body["mistakes"]) == 1
    assert "provider is down" in body["error"]
    assert "whole bank" in body["answer"]


async def test_a_broken_summariser_still_hands_back_the_rows(client, monkeypatch):
    from app.routers import ask as ask_router

    class Broken(StubAnalyzer):
        async def summarise(self, question, digest, context=""):
            raise RuntimeError("provider is down")

    monkeypatch.setattr(ask_router, "get_analyzer", lambda: Broken())
    await _log(client, MATH_MISTAKE)

    body = (await client.post("/ask", json={"question": "everything"})).json()

    # The prose is the disposable half; the rows are the point.
    assert len(body["mistakes"]) == 1
    assert "1 question(s) matched" in body["answer"]
    assert "provider is down" in body["error"]


async def test_an_empty_question_is_rejected(client):
    assert (await client.post("/ask", json={"question": "   "})).status_code in (200, 422)
    assert (await client.post("/ask", json={"question": ""})).status_code == 422


async def test_the_bank_can_be_asked_about_dates_on_both_sides(client, session_factory):
    old = await _log(client, MATH_MISTAKE)
    await _age(session_factory, old, days=40)
    recent = await _log(client, BIOLOGY_MISTAKE)

    body = (await client.post("/ask", json={"question": "logged in the last two weeks"})).json()

    ids = [m["id"] for m in body["mistakes"]]
    assert recent in ids
    assert old not in ids
    assert datetime.fromisoformat(body["mistakes"][0]["created_at"]).tzinfo is not None
    assert (
        body["query"]["logged_after"] == (datetime.now(UTC).date() - timedelta(days=14)).isoformat()
    )


# --- filtering by the bank's own words ------------------------------------------


async def test_a_topic_the_bank_actually_has_is_matched(client):
    circles = await _log(client, MATH_MISTAKE, topic="circles")
    await _log(client, MATH_MISTAKE, topic="linear equations")

    body = (await client.post("/ask", json={"question": "show me my circles questions"})).json()

    assert [m["id"] for m in body["mistakes"]] == [circles]
    assert "circles" in body["filter_description"]


async def test_a_multi_word_topic_is_matched_out_of_order(client):
    respiration = await _log(client, BIOLOGY_MISTAKE, topic="cellular respiration")
    await _log(client, MATH_MISTAKE, topic="circles")

    body = (await client.post("/ask", json={"question": "the respiration cellular ones"})).json()

    assert [m["id"] for m in body["mistakes"]] == [respiration]


async def test_a_concept_can_be_asked_for_by_name(client):
    tagged = await _log(client, MATH_MISTAKE)
    await _log(client, BIOLOGY_MISTAKE)
    concept = (
        await client.post("/concepts", json={"title": "Circumference gives the radius"})
    ).json()
    await client.post(f"/concepts/{concept['id']}/questions/{tagged}")

    body = (
        await client.post(
            "/ask", json={"question": "everything under circumference gives the radius"}
        )
    ).json()

    assert [m["id"] for m in body["mistakes"]] == [tagged]
    assert "under Circumference gives the radius" in body["filter_description"]


async def test_a_common_word_in_a_concept_title_does_not_drag_it_in(client):
    """A concept called "Read the question" must not match every question asked."""
    tagged = await _log(client, MATH_MISTAKE)
    concept = (await client.post("/concepts", json={"title": "Read the question"})).json()
    await client.post(f"/concepts/{concept['id']}/questions/{tagged}")
    await _log(client, BIOLOGY_MISTAKE)

    body = (await client.post("/ask", json={"question": "show me the questions"})).json()

    assert body["query"]["concepts"] == []
    assert len(body["mistakes"]) == 2


async def test_the_answer_says_which_analyzer_produced_it(client):
    await _log(client, MATH_MISTAKE)

    body = (await client.post("/ask", json={"question": "everything"})).json()

    assert body["analyzer"] == "stub"
    assert body["analyzer_ready"] is True


async def test_an_overview_question_gets_the_counts_not_a_guess(client):
    """ "What am I worst at" is answered from tallies, not by the model eyeballing rows."""
    for _ in range(3):
        await _log(client, MATH_MISTAKE, error_type="concept_gap", urgency="fundamental")
    await _log(client, BIOLOGY_MISTAKE, error_type="trap_answer", urgency="important")

    body = (await client.post("/ask", json={"question": "what am I worst at"})).json()

    assert len(body["mistakes"]) == 4
    assert "concept_gap (3)" in body["answer"]
    assert "fundamental (3)" in body["answer"]
