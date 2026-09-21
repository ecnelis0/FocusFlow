"""The side assistant. The model writes the filter; the database writes the answer."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from app.analysis.stub import StubAnalyzer
from app.models import Mistake
from app.query import BankQuery, Vocabulary, describe
from tests.conftest import BIOLOGY_MISTAKE, MATH_MISTAKE, add_question

TODAY = date(2026, 9, 7)


async def _age(session_factory, mistake_id: str, days: int) -> None:
    """Move a question back in time, as if it had been added `days` ago."""
    async with session_factory() as session:
        mistake = await session.get(Mistake, mistake_id)
        mistake.created_at = mistake.created_at - timedelta(days=days)
        await session.commit()


# --- interpreting the sentence ------------------------------------------------


EMPTY_VOCABULARY = Vocabulary()
TWO_SUBJECTS = Vocabulary(subjects=["Biology", "Math"])


async def test_a_subject_is_matched_however_it_is_typed_and_copied_as_the_bank_spells_it():
    """Subjects are free text, so the filter carries the bank's own spelling."""
    query = await StubAnalyzer().interpret("my BIOLOGY questions", TODAY, TWO_SUBJECTS)

    assert query.subjects == ["Biology"]


async def test_a_subject_the_bank_does_not_have_is_not_invented():
    query = await StubAnalyzer().interpret("my chemistry questions", TODAY, TWO_SUBJECTS)

    assert query.subjects == []


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
    """Subject and date are what separate these now; urgency used to be the third."""
    wanted = await add_question(session_factory, BIOLOGY_MISTAKE)
    too_old = await add_question(session_factory, BIOLOGY_MISTAKE)
    wrong_subject = await add_question(session_factory, MATH_MISTAKE)
    await _age(session_factory, too_old, days=200)

    body = (
        await client.post(
            "/ask",
            json={
                "question": "give me all the questions logged in the past 3 months "
                "from the biology category"
            },
        )
    ).json()

    returned = [m["id"] for m in body["mistakes"]]
    assert returned == [wanted]
    assert wrong_subject not in returned
    assert too_old not in returned
    assert body["error"] is None


async def test_the_answer_shows_what_was_actually_searched(client, session_factory):
    await add_question(session_factory, BIOLOGY_MISTAKE)

    body = (
        await client.post("/ask", json={"question": "biology from the past 3 months"})
    ).json()

    assert "in Biology" in body["filter_description"]
    assert "logged since" in body["filter_description"]
    assert body["query"]["subjects"] == ["Biology"]


async def test_the_vocabulary_lists_the_subjects_the_bank_actually_has(client, session_factory):
    """Without this the model could only guess at how the student spells a subject."""
    from app.query import vocabulary

    await add_question(session_factory, MATH_MISTAKE)
    await add_question(session_factory, BIOLOGY_MISTAKE)
    await add_question(session_factory, {**MATH_MISTAKE, "subject": None})

    async with session_factory() as session:
        words = await vocabulary(session, "local")

    assert words.subjects == ["Biology", "Math"]
    assert "Subjects in this bank: Biology, Math" in words.render()


async def test_a_question_that_matches_nothing_says_so(client, session_factory):
    """A real constraint that excludes everything, not a word the bank cannot read.

    Naming a subject the bank does not have is the wrong test: the interpreter
    only matches vocabulary it was given, so an unknown word yields an *empty*
    filter, which matches every row rather than none.
    """
    old = await add_question(session_factory, MATH_MISTAKE)
    await _age(session_factory, old, days=200)

    asked = {"question": "what did I log in the past 3 months"}
    body = (await client.post("/ask", json=asked)).json()

    assert body["mistakes"] == []
    assert "No questions matched" in body["answer"]


async def test_asking_only_ever_sees_your_own_bank(client, session_factory):
    await add_question(session_factory, BIOLOGY_MISTAKE)

    body = (
        await client.post(
            "/ask", json={"question": "everything"}, headers={"X-User-Id": "someone-else"}
        )
    ).json()

    assert body["mistakes"] == []


async def test_a_broken_interpreter_still_hands_back_the_bank(client, session_factory, monkeypatch):
    from app.routers import ask as ask_router

    class Broken(StubAnalyzer):
        async def interpret(self, question, today, vocabulary):
            raise RuntimeError("provider is down")

    monkeypatch.setattr(ask_router, "get_analyzer", lambda: Broken())
    await add_question(session_factory, MATH_MISTAKE)

    body = (await client.post("/ask", json={"question": "anything at all"})).json()

    assert len(body["mistakes"]) == 1
    assert "provider is down" in body["error"]
    assert "whole bank" in body["answer"]


async def test_a_broken_summariser_still_hands_back_the_rows(client, session_factory, monkeypatch):
    from app.routers import ask as ask_router

    class Broken(StubAnalyzer):
        async def summarise(self, question, digest, context=""):
            raise RuntimeError("provider is down")

    monkeypatch.setattr(ask_router, "get_analyzer", lambda: Broken())
    await add_question(session_factory, MATH_MISTAKE)

    body = (await client.post("/ask", json={"question": "everything"})).json()

    # The prose is the disposable half; the rows are the point.
    assert len(body["mistakes"]) == 1
    assert "1 question(s) matched" in body["answer"]
    assert "provider is down" in body["error"]


async def test_an_empty_question_is_rejected(client):
    assert (await client.post("/ask", json={"question": "   "})).status_code in (200, 422)
    assert (await client.post("/ask", json={"question": ""})).status_code == 422


async def test_the_bank_can_be_asked_about_dates_on_both_sides(client, session_factory):
    old = await add_question(session_factory, MATH_MISTAKE)
    await _age(session_factory, old, days=40)
    recent = await add_question(session_factory, BIOLOGY_MISTAKE)

    body = (await client.post("/ask", json={"question": "logged in the last two weeks"})).json()

    ids = [m["id"] for m in body["mistakes"]]
    assert recent in ids
    assert old not in ids
    assert datetime.fromisoformat(body["mistakes"][0]["created_at"]).tzinfo is not None
    assert (
        body["query"]["logged_after"] == (datetime.now(UTC).date() - timedelta(days=14)).isoformat()
    )


# --- filtering by the bank's own words ------------------------------------------


async def test_a_topic_the_bank_actually_has_is_matched(client, session_factory):
    circles = await add_question(session_factory, MATH_MISTAKE, topic="circles")
    await add_question(session_factory, MATH_MISTAKE, topic="linear equations")

    body = (await client.post("/ask", json={"question": "show me my circles questions"})).json()

    assert [m["id"] for m in body["mistakes"]] == [circles]
    assert "circles" in body["filter_description"]


async def test_a_multi_word_topic_is_matched_out_of_order(client, session_factory):
    respiration = await add_question(session_factory, BIOLOGY_MISTAKE, topic="cellular respiration")
    await add_question(session_factory, MATH_MISTAKE, topic="circles")

    body = (await client.post("/ask", json={"question": "the respiration cellular ones"})).json()

    assert [m["id"] for m in body["mistakes"]] == [respiration]


async def test_a_concept_can_be_asked_for_by_name(client, session_factory):
    tagged = await add_question(session_factory, MATH_MISTAKE)
    await add_question(session_factory, BIOLOGY_MISTAKE)
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


async def test_a_common_word_in_a_concept_title_does_not_drag_it_in(client, session_factory):
    """A concept called "Read the question" must not match every question asked."""
    tagged = await add_question(session_factory, MATH_MISTAKE)
    concept = (await client.post("/concepts", json={"title": "Read the question"})).json()
    await client.post(f"/concepts/{concept['id']}/questions/{tagged}")
    await add_question(session_factory, BIOLOGY_MISTAKE)

    body = (await client.post("/ask", json={"question": "show me the questions"})).json()

    assert body["query"]["concepts"] == []
    assert len(body["mistakes"]) == 2


async def test_the_answer_says_which_analyzer_produced_it(client, session_factory):
    await add_question(session_factory, MATH_MISTAKE)

    body = (await client.post("/ask", json={"question": "everything"})).json()

    assert body["analyzer"] == "stub"
    assert body["analyzer_ready"] is True


async def test_an_overview_question_gets_the_counts_not_a_guess(client, session_factory):
    """ "What am I worst at" is answered from tallies, not by the model eyeballing rows."""
    for _ in range(3):
        await add_question(session_factory, MATH_MISTAKE)
    await add_question(session_factory, BIOLOGY_MISTAKE)

    body = (await client.post("/ask", json={"question": "what am I worst at"})).json()

    assert len(body["mistakes"]) == 4
    # Counted here, not estimated by the model looking at rows.
    assert "Math (3)" in body["answer"]
    assert "Biology (1)" in body["answer"]
