"""Multi-facet search, and topics reported under the subject they belong to."""

from __future__ import annotations

from tests.conftest import BIOLOGY_MISTAKE, MATH_MISTAKE, add_question


async def _log(client, session_factory, payload, **overrides):
    mistake_id = await add_question(session_factory, payload)
    if overrides:
        response = await client.patch(f"/mistakes/{mistake_id}", json=overrides)
        assert response.status_code == 200, response.text
    return mistake_id


async def test_subjects_filter_as_whole_strings_ignoring_case(client, session_factory):
    """Free text on both sides: "math" must find "Math", and only "Math"."""
    math = await _log(client, session_factory, MATH_MISTAKE)
    await _log(client, session_factory, BIOLOGY_MISTAKE)
    await _log(client, session_factory, {**MATH_MISTAKE, "subject": "Mathematical logic"})

    found = (await client.post("/mistakes/search", json={"subjects": ["math"]})).json()
    shouted = (await client.post("/mistakes/search", json={"subjects": ["MATH"]})).json()

    assert [m["id"] for m in found] == [math]
    assert [m["id"] for m in shouted] == [math]


async def test_subjects_or_within_the_facet(client, session_factory):
    math = await _log(client, session_factory, MATH_MISTAKE)
    biology = await _log(client, session_factory, BIOLOGY_MISTAKE)
    await _log(client, session_factory, {**MATH_MISTAKE, "subject": "Spanish"})

    found = (await client.post("/mistakes/search", json={"subjects": ["Math", "Biology"]})).json()

    assert {m["id"] for m in found} == {math, biology}


async def test_search_ands_across_facets(client, session_factory):
    """Every facet has to be satisfied at once, not any one of them."""
    wanted = await _log(
        client, session_factory, MATH_MISTAKE, topic="math fundamentals", tags=["by mistake"]
    )
    # Each of these differs from the target in exactly one facet.
    await _log(client, session_factory, MATH_MISTAKE, topic="circles", tags=["by mistake"])
    await _log(
        client, session_factory, MATH_MISTAKE, topic="math fundamentals", tags=["guessed"]
    )
    await _log(
        client,
        session_factory,
        {**BIOLOGY_MISTAKE, "subject": "Biology"},
        topic="math fundamentals",
        tags=["by mistake"],
    )

    found = (
        await client.post(
            "/mistakes/search",
            json={
                "topics": ["math fundamentals"],
                "tags": ["by mistake"],
                "subjects": ["Math"],
            },
        )
    ).json()

    assert [m["id"] for m in found] == [wanted]

async def test_search_ors_within_a_facet(client, session_factory):
    circles = await _log(client, session_factory, MATH_MISTAKE, topic="circles")
    lines = await _log(client, session_factory, MATH_MISTAKE, topic="straight lines")
    await _log(client, session_factory, MATH_MISTAKE, topic="vectors")

    found = (
        await client.post("/mistakes/search", json={"topics": ["circles", "straight lines"]})
    ).json()

    assert {m["id"] for m in found} == {circles, lines}


async def test_an_empty_search_returns_the_whole_bank(client, session_factory):
    await _log(client, session_factory, MATH_MISTAKE)
    await _log(client, session_factory, BIOLOGY_MISTAKE)

    found = (await client.post("/mistakes/search", json={})).json()

    assert len(found) == 2


async def test_search_only_ever_sees_your_own_bank(client, session_factory):
    await _log(client, session_factory, MATH_MISTAKE)

    found = (
        await client.post("/mistakes/search", json={}, headers={"X-User-Id": "someone-else"})
    ).json()

    assert found == []


async def test_search_rejects_a_facet_value_that_is_not_in_the_vocabulary(client):
    response = await client.post("/mistakes/search", json={"urgency": ["kind of urgent"]})

    assert response.status_code == 422


# --- finding the questions that carry no concept -------------------------------


async def test_untagged_questions_can_be_singled_out(client, session_factory):
    """The gap the side rail cannot show: questions filed under nothing."""
    tagged = await _log(client, session_factory, MATH_MISTAKE)
    untagged = await _log(client, session_factory, BIOLOGY_MISTAKE)
    concept = (await client.post("/concepts", json={"title": "A concept"})).json()
    await client.post(f"/concepts/{concept['id']}/questions/{tagged}")

    without = (await client.post("/mistakes/search", json={"has_concept": False})).json()
    with_one = (await client.post("/mistakes/search", json={"has_concept": True})).json()

    assert [m["id"] for m in without] == [untagged]
    assert [m["id"] for m in with_one] == [tagged]


async def test_leaving_has_concept_unset_returns_both(client, session_factory):
    tagged = await _log(client, session_factory, MATH_MISTAKE)
    await _log(client, session_factory, BIOLOGY_MISTAKE)
    concept = (await client.post("/concepts", json={"title": "A concept"})).json()
    await client.post(f"/concepts/{concept['id']}/questions/{tagged}")

    assert len((await client.post("/mistakes/search", json={})).json()) == 2


async def test_a_concept_with_nothing_tagged_is_reported_as_such(client, session_factory):
    """The bug: clicking an empty concept looked like the filter was broken."""
    await _log(client, session_factory, MATH_MISTAKE)
    empty = (await client.post("/concepts", json={"title": "inverse trig"})).json()

    found = (await client.post("/mistakes/search", json={"concept_ids": [empty["id"]]})).json()

    assert found == []
    assert empty["question_count"] == 0
    # And the concept itself is still there to be seen and tagged into.
    assert (await client.get(f"/concepts/{empty['id']}")).status_code == 200
