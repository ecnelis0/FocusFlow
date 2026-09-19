"""Concepts nest: a few broad ideas, with their details hanging underneath.

The point of the shape is the mind map. What matters here is that the tree can
always be drawn and always be walked - so the links that would make that
impossible (a concept under itself, a parent that does not exist, a cycle) are
refused at the point of filing rather than found later by something that hangs.
"""

from __future__ import annotations

# Three paragraphs: the offline extractor makes the first the branch and hangs the
# other two beneath it, which is the shape the real extractor is asked for.
NOTES = """\
The American Revolution: the colonies broke from Britain between 1765 and 1783.

The Battle of Yorktown: Cornwallis surrendered in 1781, ending major fighting.

The Proclamation Line of 1763: Britain forbade settlement west of the Appalachians.
"""


async def file_notes(client, text: str = NOTES, **overrides) -> list[dict]:
    """Scan and approve, the way the page does, and return what is in the bank."""
    proposal = (await client.post("/capture", data={"text": text})).json()
    body = {
        "concepts": [
            {k: c[k] for k in ("title", "body", "subject", "parent_title", "existing_id")}
            for c in proposal["concepts"]
        ],
        "image_filename": None,
        **overrides,
    }
    response = await client.post("/capture/commit", json=body)
    assert response.status_code == 200, response.text
    return (await client.get("/concepts")).json()


def by_title(concepts: list[dict]) -> dict[str, dict]:
    return {c["title"]: c for c in concepts}


async def test_details_are_filed_under_the_branch(client):
    concepts = by_title(await file_notes(client))
    assert len(concepts) == 3

    branch = concepts["The American Revolution"]
    assert branch["parent_id"] is None, "the organising concept is the top of the map"
    for detail in ("The Battle of Yorktown", "The Proclamation Line of 1763"):
        assert concepts[detail]["parent_id"] == branch["id"], detail


async def test_the_proposal_names_the_parent_before_anything_is_filed(client):
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    concepts = proposal["concepts"]

    assert concepts[0]["parent_title"] is None
    assert concepts[1]["parent_title"] == "The American Revolution"
    # Still nothing in the bank: naming a parent is part of the proposal.
    assert (await client.get("/concepts")).json() == []


async def test_a_concept_is_not_filed_under_itself(client):
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    concepts = [
        {k: c[k] for k in ("title", "body", "subject", "parent_title", "existing_id")}
        for c in proposal["concepts"]
    ]
    concepts[0]["parent_title"] = concepts[0]["title"]

    await client.post("/capture/commit", json={"concepts": concepts, "image_filename": None})
    filed = by_title((await client.get("/concepts")).json())
    assert filed["The American Revolution"]["parent_id"] is None


async def test_a_cycle_is_refused_rather_than_stored(client):
    """A points at B and B points at A: one link lands, the one closing the loop does not.

    Stored, this would raise nothing now and hang every later walk up the tree.
    """
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    concepts = [
        {k: c[k] for k in ("title", "body", "subject", "parent_title", "existing_id")}
        for c in proposal["concepts"]
    ]
    # The branch is already the parent of the second; make the branch claim the
    # second as *its* parent, which would close the loop.
    concepts[0]["parent_title"] = concepts[1]["title"]

    await client.post("/capture/commit", json={"concepts": concepts, "image_filename": None})
    filed = by_title((await client.get("/concepts")).json())

    # Walking up from every concept terminates.
    ids = {c["id"]: c for c in filed.values()}
    for concept in filed.values():
        seen, node = set(), concept
        while node["parent_id"] is not None:
            assert node["id"] not in seen, "the tree loops"
            seen.add(node["id"])
            node = ids[node["parent_id"]]


async def test_a_parent_that_is_not_in_the_bank_is_ignored(client):
    proposal = (await client.post("/capture", data={"text": NOTES})).json()
    concepts = [
        {k: c[k] for k in ("title", "body", "subject", "parent_title", "existing_id")}
        for c in proposal["concepts"]
    ]
    concepts[1]["parent_title"] = "A concept nobody ever wrote"

    await client.post("/capture/commit", json={"concepts": concepts, "image_filename": None})
    filed = by_title((await client.get("/concepts")).json())
    # Filed loose at the top rather than pointing at a row that does not exist.
    assert filed["The Battle of Yorktown"]["parent_id"] is None


async def test_deleting_a_branch_keeps_its_details(client):
    """The children are concepts in their own right; they are promoted, not deleted.

    SQLite runs no `ON DELETE` here, so this is done in Python or not at all -
    without it the children would point at a row that is gone.
    """
    concepts = by_title(await file_notes(client))
    branch = concepts["The American Revolution"]

    assert (await client.delete(f"/concepts/{branch['id']}")).status_code == 204

    left = by_title((await client.get("/concepts")).json())
    assert "The American Revolution" not in left
    assert len(left) == 2
    for detail in ("The Battle of Yorktown", "The Proclamation Line of 1763"):
        assert detail in left, f"{detail} was destroyed with its parent"
        assert left[detail]["parent_id"] is None


async def test_a_branch_can_be_one_already_in_the_bank(client):
    """A second capture adds detail under a branch filed by the first."""
    await file_notes(client)
    filed = by_title((await client.get("/concepts")).json())
    branch_id = filed["The American Revolution"]["id"]

    await client.post(
        "/capture/commit",
        json={
            "concepts": [
                {
                    "title": "The Treaty of Paris 1783",
                    "body": "Britain recognised the United States.",
                    "subject": None,
                    "parent_title": "The American Revolution",
                    "existing_id": None,
                }
            ],
            "image_filename": None,
        },
    )

    after = by_title((await client.get("/concepts")).json())
    assert after["The Treaty of Paris 1783"]["parent_id"] == branch_id
