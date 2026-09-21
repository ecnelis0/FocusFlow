"""Subjects and the topic folders inside them.

The two facts these tests exist to protect, both of which are easy to break and
invisible when broken:

1. A subject's name is copied onto every row filed under it. Rename it, move a
   folder, delete a subject - all three have to carry the copy, or the bank keeps
   filtering on a name that no tab shows.
2. A row can only be in a folder if it also carries that folder's subject name.
   `SubjectRead.unfiled_*` subtracts the folders' counts from the subject's, so the
   moment that invariant slips the "Unfiled" card starts showing a negative.
"""

from __future__ import annotations

from tests.conftest import BIOLOGY_MISTAKE, MATH_MISTAKE, add_question


async def _subject(client, name="APUSH"):
    response = await client.post("/subjects", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def _folder(client, subject_id, name="Unit 3: Revolution"):
    response = await client.post(f"/subjects/{subject_id}/folders", json={"name": name})
    assert response.status_code == 201, response.text
    return next(f for f in response.json()["folders"] if f["name"] == name)


async def test_a_subject_exists_before_anything_is_logged_into_it(client):
    """The whole reason subjects are rows: you set your courses up first."""
    subject = await _subject(client)

    assert subject["name"] == "APUSH"
    assert subject["folders"] == []
    assert subject["question_count"] == 0

    listed = (await client.get("/subjects")).json()
    assert [s["name"] for s in listed] == ["APUSH"]


async def test_one_course_cannot_become_two_tabs(client):
    """Case-insensitive, because "apush" and "APUSH" are the same course."""
    await _subject(client, "APUSH")

    clash = await client.post("/subjects", json={"name": "apush"})
    assert clash.status_code == 409
    assert "already have" in clash.json()["detail"]


async def test_a_blank_subject_name_is_refused(client):
    assert (await client.post("/subjects", json={"name": "   "})).status_code == 422


async def test_folders_live_inside_one_subject(client):
    subject = await _subject(client)
    await _folder(client, subject["id"], "Unit 3: Revolution")
    after = await client.post(
        f"/subjects/{subject['id']}/folders", json={"name": "Unit 4: Constitution"}
    )

    assert [f["name"] for f in after.json()["folders"]] == [
        "Unit 3: Revolution",
        "Unit 4: Constitution",
    ]


async def test_two_folders_in_one_subject_cannot_share_a_name(client):
    subject = await _subject(client)
    await _folder(client, subject["id"])

    clash = await client.post(
        f"/subjects/{subject['id']}/folders", json={"name": "unit 3: revolution"}
    )
    assert clash.status_code == 409


async def test_the_same_folder_name_is_fine_in_two_subjects(client):
    """"Unit 1" is a reasonable name in every course, so the clash is per subject."""
    apush = await _subject(client, "APUSH")
    calc = await _subject(client, "Calculus")

    await _folder(client, apush["id"], "Unit 1")
    ok = await client.post(f"/subjects/{calc['id']}/folders", json={"name": "Unit 1"})
    assert ok.status_code == 201


# --- filing --------------------------------------------------------------------


async def test_filing_a_question_gives_it_the_folders_subject(client, session_factory):
    """The folder decides the subject. A subject carried alongside it does not."""
    subject = await _subject(client, "APUSH")
    folder = await _folder(client, subject["id"])

    question_id = await add_question(
        session_factory,
        {**MATH_MISTAKE, "subject": "Something else entirely", "folder_id": folder["id"]},
    )

    logged = (await client.get(f"/mistakes/{question_id}")).json()
    assert logged["folder_id"] == folder["id"]
    assert logged["subject"] == "APUSH"


async def test_filing_a_concept_gives_it_the_folders_subject(client):
    subject = await _subject(client, "Calculus")
    folder = await _folder(client, subject["id"], "Related rates")

    concept = await client.post(
        "/concepts", json={"title": "Differentiate both sides", "folder_id": folder["id"]}
    )
    assert concept.status_code == 201
    assert concept.json()["subject"] == "Calculus"
    assert concept.json()["folder_id"] == folder["id"]


async def test_a_folder_from_someone_elses_bank_is_a_404(client, session_factory):
    """Not a silent unfiling: filing into a folder you do not own is an attempt.

    Asserted against `/capture/commit`, which is the only way anything is filed
    now that questions are no longer logged one at a time.
    """
    subject = await _subject(client)
    folder = await _folder(client, subject["id"])

    theirs = await client.post(
        "/capture/commit",
        json={
            "concepts": [{"title": "Theirs", "body": "", "subject": None}],
            "folder_id": folder["id"],
        },
        headers={"X-User-Id": "someone-else"},
    )
    assert theirs.status_code == 404


async def test_logging_with_a_typed_subject_creates_its_tab(client, session_factory):
    """A subject nobody created must still get a tab, or its questions have no home."""
    await add_question(session_factory, BIOLOGY_MISTAKE)

    listed = (await client.get("/subjects")).json()
    assert [s["name"] for s in listed] == ["Biology"]
    assert listed[0]["question_count"] == 1
    assert listed[0]["unfiled_question_count"] == 1


async def test_counts_split_filed_from_unfiled(client, session_factory):
    subject = await _subject(client, "Math")
    folder = await _folder(client, subject["id"], "Linear equations")

    await add_question(session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]})
    await add_question(session_factory, MATH_MISTAKE)  # same subject, no folder

    listed = (await client.get("/subjects")).json()
    assert listed[0]["question_count"] == 2
    assert listed[0]["folders"][0]["question_count"] == 1
    assert listed[0]["unfiled_question_count"] == 1


async def test_taking_a_question_out_of_its_folder_keeps_its_subject(client, session_factory):
    """Unfiled from a unit is not the same as no longer being a Calculus question."""
    subject = await _subject(client, "Calculus")
    folder = await _folder(client, subject["id"], "Related rates")
    question_id = await add_question(
        session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]}
    )
    logged = (await client.get(f"/mistakes/{question_id}")).json()

    moved = await client.patch(f"/mistakes/{logged['id']}", json={"folder_id": None})
    assert moved.json()["folder_id"] is None
    assert moved.json()["subject"] == "Calculus"


# --- the copied name, and the three things that have to carry it ----------------


async def test_renaming_a_subject_carries_the_new_name_to_its_rows(client, session_factory):
    subject = await _subject(client, "APUSH")
    folder = await _folder(client, subject["id"])
    question_id = await add_question(
        session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]}
    )
    logged = (await client.get(f"/mistakes/{question_id}")).json()
    concept = (
        await client.post(
            "/concepts", json={"title": "Taxation without representation", "subject": "APUSH"}
        )
    ).json()

    renamed = await client.patch(f"/subjects/{subject['id']}", json={"name": "AP US History"})
    assert renamed.json()["name"] == "AP US History"
    # The tab still counts both, which it only can if the copies moved with it.
    assert renamed.json()["question_count"] == 1
    assert renamed.json()["concept_count"] == 1

    assert (await client.get(f"/mistakes/{logged['id']}")).json()["subject"] == "AP US History"
    assert (await client.get(f"/concepts/{concept['id']}")).json()["subject"] == "AP US History"


async def test_moving_a_folder_carries_everything_in_it(client, session_factory):
    apush = await _subject(client, "APUSH")
    calc = await _subject(client, "Calculus")
    folder = await _folder(client, apush["id"], "Unit 1")
    question_id = await add_question(
        session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]}
    )
    logged = (await client.get(f"/mistakes/{question_id}")).json()

    moved = await client.patch(f"/folders/{folder['id']}", json={"subject_id": calc["id"]})
    assert moved.status_code == 200
    assert moved.json()["subject_id"] == calc["id"]

    assert (await client.get(f"/mistakes/{logged['id']}")).json()["subject"] == "Calculus"

    listed = {s["name"]: s for s in (await client.get("/subjects")).json()}
    assert listed["APUSH"]["question_count"] == 0
    assert listed["Calculus"]["question_count"] == 1


async def test_renaming_a_folder_does_not_move_anything(client, session_factory):
    """The move rewrites subjects unconditionally; a rename must not be a move."""
    apush = await _subject(client, "APUSH")
    folder = await _folder(client, apush["id"], "Unit 1")
    question_id = await add_question(
        session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]}
    )
    logged = (await client.get(f"/mistakes/{question_id}")).json()

    renamed = await client.patch(f"/folders/{folder['id']}", json={"name": "Unit 1: Colonial"})
    assert renamed.json()["name"] == "Unit 1: Colonial"
    assert renamed.json()["subject_id"] == apush["id"]

    after = (await client.get(f"/mistakes/{logged['id']}")).json()
    assert after["subject"] == "APUSH"
    assert after["folder_id"] == folder["id"]


async def test_deleting_a_folder_keeps_the_questions_in_the_subject(client, session_factory):
    subject = await _subject(client, "APUSH")
    folder = await _folder(client, subject["id"])
    question_id = await add_question(
        session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]}
    )
    logged = (await client.get(f"/mistakes/{question_id}")).json()

    assert (await client.delete(f"/folders/{folder['id']}")).status_code == 204

    after = (await client.get(f"/mistakes/{logged['id']}")).json()
    assert after["folder_id"] is None
    assert after["subject"] == "APUSH"

    listed = (await client.get("/subjects")).json()
    assert listed[0]["folders"] == []
    assert listed[0]["unfiled_question_count"] == 1


async def test_deleting_a_subject_leaves_its_questions_unfiled_not_deleted(client, session_factory):
    """Losing where something was filed is bad. Losing the question is unthinkable."""
    subject = await _subject(client, "APUSH")
    folder = await _folder(client, subject["id"])
    question_id = await add_question(
        session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]}
    )
    logged = (await client.get(f"/mistakes/{question_id}")).json()

    assert (await client.delete(f"/subjects/{subject['id']}")).status_code == 204

    after = await client.get(f"/mistakes/{logged['id']}")
    assert after.status_code == 200
    assert after.json()["folder_id"] is None
    assert after.json()["subject"] is None
    assert (await client.get("/subjects")).json() == []


async def test_a_deleted_subject_leaves_no_row_pointing_at_a_gone_folder(client):
    """SQLite ignores ON DELETE SET NULL, so the nulling is done in Python.

    A row still carrying a dead folder id would filter into a folder that is not
    in any subject - invisible in every view, and impossible to get back out of.
    """
    subject = await _subject(client, "APUSH")
    folder = await _folder(client, subject["id"])
    concept = (
        await client.post("/concepts", json={"title": "Stamp Act", "folder_id": folder["id"]})
    ).json()

    await client.delete(f"/subjects/{subject['id']}")

    assert (await client.get(f"/concepts/{concept['id']}")).json()["folder_id"] is None


# --- the bank filters by folder ------------------------------------------------


async def test_the_bank_can_be_filtered_to_one_folder(client, session_factory):
    subject = await _subject(client, "Math")
    unit_one = await _folder(client, subject["id"], "Linear equations")
    unit_two = await _folder(client, subject["id"], "Circles")

    await add_question(session_factory, {**MATH_MISTAKE, "folder_id": unit_one["id"]})
    await add_question(session_factory, {**BIOLOGY_MISTAKE, "folder_id": unit_two["id"]})

    found = await client.post("/mistakes/search", json={"folder_ids": [unit_one["id"]]})
    assert [m["question_text"] for m in found.json()] == [MATH_MISTAKE["question_text"]]


async def test_the_bank_can_show_what_is_not_in_a_folder_yet(client, session_factory):
    """The "Unfiled" card's filter: in the subject, in none of its folders."""
    subject = await _subject(client, "Math")
    folder = await _folder(client, subject["id"], "Linear equations")

    await add_question(session_factory, {**MATH_MISTAKE, "folder_id": folder["id"]})
    loose = await add_question(session_factory, {**BIOLOGY_MISTAKE, "subject": "Math"})

    found = await client.post(
        "/mistakes/search", json={"subjects": ["Math"], "has_folder": False}
    )
    assert [m["id"] for m in found.json()] == [loose]


async def test_a_subject_on_a_question_but_in_no_row_still_gets_a_tab(client, session_factory):
    """The failure this guards: questions that exist but have nowhere to appear.

    A row can arrive without going through the API - a seed script, a restore, an
    import - and then no `ensure_subject` ever ran for it. With the bank drawn as
    tabs, a subject with no row has no tab, and every question under it is
    invisible in every view. Reading the strip reconciles.
    """
    from app.models import Mistake, new_id, utcnow

    async with session_factory() as session:
        session.add(
            Mistake(
                id=new_id(),
                user_id="local",
                created_at=utcnow(),
                subject="Spanish",
                question_text="ser or estar?",
                correct_answer="estar",
            )
        )
        await session.commit()

    listed = (await client.get("/subjects")).json()
    assert [s["name"] for s in listed] == ["Spanish"]
    assert listed[0]["question_count"] == 1


async def test_reconciling_does_not_split_one_course_into_two_tabs(client, session_factory):
    """Rows spelled differently are one course, so they must reconcile to one tab."""
    from app.models import Mistake, new_id, utcnow

    async with session_factory() as session:
        for spelling in ("APUSH", "apush"):
            session.add(
                Mistake(
                    id=new_id(),
                    user_id="local",
                    created_at=utcnow(),
                    subject=spelling,
                    question_text=f"Something about {spelling}",
                    correct_answer="b",
                )
            )
        await session.commit()

    listed = (await client.get("/subjects")).json()
    assert len(listed) == 1
    assert listed[0]["question_count"] == 2
