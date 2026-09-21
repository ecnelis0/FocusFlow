"""The student's own labels, and filing under a concept while logging."""

from __future__ import annotations

from tests.conftest import BIOLOGY_MISTAKE, MATH_MISTAKE, add_question


async def _log(client, session_factory, **overrides):
    """A question in the bank, with any labels applied the way the app applies them.

    Tags go on through `PATCH`, not straight into the row: tidying them - trimming,
    dropping blanks, folding duplicate cases - is a validator on `MistakeUpdate`,
    so a test that wrote them directly would assert against a state the app cannot
    actually produce.
    """
    tags = overrides.pop("tags", None)
    mistake_id = await add_question(session_factory, {**MATH_MISTAKE, **overrides})
    if tags is not None:
        response = await client.patch(f"/mistakes/{mistake_id}", json={"tags": tags})
        assert response.status_code == 200, response.text
        return response.json()
    return (await client.get(f"/mistakes/{mistake_id}")).json()


async def _concept(client, title="Circumference gives the radius"):
    return (await client.post("/concepts", json={"title": title})).json()


# --- labelling while logging ----------------------------------------------------


async def test_a_question_can_be_labelled_as_it_is_logged(client, session_factory):
    body = await _log(client, session_factory, tags=["by mistake", "ran out of time"])

    assert body["tags"] == ["by mistake", "ran out of time"]


async def test_labels_are_tidied_rather_than_taken_literally(client, session_factory):
    body = await _log(client, session_factory, tags=["  by   mistake  ", "", "   "])

    assert body["tags"] == ["by mistake"]


async def test_the_same_label_in_two_cases_is_one_label(client, session_factory):
    """ "By Mistake" and "by mistake" as separate tags would split every count."""
    body = await _log(client, session_factory, tags=["By Mistake", "by mistake", "BY MISTAKE"])

    assert body["tags"] == ["By Mistake"]


async def test_labels_can_be_changed_afterwards(client, session_factory):
    body = await _log(client, session_factory, tags=["guessed"])

    updated = (
        await client.patch(f"/mistakes/{body['id']}", json={"tags": ["knew it, blanked"]})
    ).json()

    assert updated["tags"] == ["knew it, blanked"]


# --- reusing them ---------------------------------------------------------------


async def test_tags_in_use_are_offered_back_commonest_first(client, session_factory):
    await _log(client, session_factory, tags=["by mistake", "guessed"])
    await _log(client, session_factory, tags=["by mistake"])

    tags = (await client.get("/tags")).json()
    used = [t for t in tags if not t["suggested"]]

    assert used[0] == {"tag": "by mistake", "count": 2, "suggested": False}
    assert {"tag": "guessed", "count": 1, "suggested": False} in used


async def test_a_suggestion_stops_being_a_suggestion_once_used(client, session_factory):
    await _log(client, session_factory, tags=["by mistake"])

    tags = (await client.get("/tags")).json()
    entry = next(t for t in tags if t["tag"].casefold() == "by mistake")

    assert entry["suggested"] is False and entry["count"] == 1
    # And it is not offered twice.
    assert [t["tag"].casefold() for t in tags].count("by mistake") == 1


async def test_your_own_invented_label_comes_back_too(client, session_factory):
    await _log(client, session_factory, tags=["forgot the +C"])

    tags = [t["tag"] for t in (await client.get("/tags")).json()]

    assert "forgot the +C" in tags


async def test_tags_are_yours_alone(client, session_factory):
    await _log(client, session_factory, tags=["by mistake"])

    tags = (await client.get("/tags", headers={"X-User-Id": "someone-else"})).json()

    assert all(t["suggested"] for t in tags)


# --- filtering by them ----------------------------------------------------------


async def test_the_bank_can_be_filtered_by_a_label(client, session_factory):
    tagged = await _log(client, session_factory, tags=["by mistake"])
    await _log(client, session_factory, tags=["guessed"])

    found = (await client.post("/mistakes/search", json={"tags": ["by mistake"]})).json()

    assert [m["id"] for m in found] == [tagged["id"]]


async def test_a_label_filter_ignores_case(client, session_factory):
    tagged = await _log(client, session_factory, tags=["By Mistake"])

    found = (await client.post("/mistakes/search", json={"tags": ["by mistake"]})).json()

    assert [m["id"] for m in found] == [tagged["id"]]


async def test_one_label_is_not_matched_by_another_containing_it(client, session_factory):
    """ "guessed" must not match a question tagged only "guessed the units"."""
    await _log(client, session_factory, tags=["guessed the units"])

    found = (await client.post("/mistakes/search", json={"tags": ["guessed"]})).json()

    assert found == []


async def test_a_label_narrows_alongside_the_other_facets(client, session_factory):
    both = await _log(client, session_factory, tags=["by mistake"], topic="circles")
    await _log(client, session_factory, tags=["by mistake"], topic="vectors")

    found = (
        await client.post(
            "/mistakes/search",
            json={"tags": ["by mistake"], "topics": ["circles"]},
        )
    ).json()

    assert [m["id"] for m in found] == [both["id"]]


async def test_the_assistant_is_told_which_labels_exist(client, session_factory):
    """A model cannot filter on a label it has never seen."""
    await _log(client, session_factory, tags=["forgot the +C"])

    from app.query import vocabulary

    async with session_factory() as session:
        words = await vocabulary(session, "local")

    assert "forgot the +C" in words.tags
    assert "forgot the +C" in words.render()


# --- filing under a concept while logging ---------------------------------------


async def test_a_question_can_be_filed_under_a_concept_as_it_is_logged(client, session_factory):
    concept = await _concept(client)

    body = await _log(client, session_factory, concept_ids=[concept["id"]])

    assert [c["title"] for c in body["concepts"]] == [concept["title"]]
    detail = (await client.get(f"/concepts/{concept['id']}")).json()
    assert [m["id"] for m in detail["mistakes"]] == [body["id"]]


async def test_a_question_can_be_filed_under_several_concepts_at_once(client, session_factory):
    first = await _concept(client, "Circumference gives the radius")
    second = await _concept(client, "Read the units")

    body = await _log(client, session_factory, concept_ids=[first["id"], second["id"]])

    assert sorted(c["title"] for c in body["concepts"]) == [
        "Circumference gives the radius",
        "Read the units",
    ]


async def test_logging_under_no_concept_is_still_normal(client, session_factory):
    body = await _log(client, session_factory)

    assert body["concepts"] == []


async def test_you_cannot_file_a_question_under_someone_elses_concept(client, session_factory):
    """Silently unfiled, not an error: the question is still yours, the concept is not."""
    concept = await _concept(client)
    mine = await add_question(session_factory, BIOLOGY_MISTAKE, user_id="someone-else")

    tagged = await client.post(
        f"/concepts/{concept['id']}/questions/{mine}",
        headers={"X-User-Id": "someone-else"},
    )

    assert tagged.status_code == 404


async def test_a_concept_id_that_does_not_exist_is_ignored_not_fatal(client, session_factory):
    body = await _log(client, session_factory, concept_ids=["deadbeef" * 4])

    assert body["concepts"] == []

