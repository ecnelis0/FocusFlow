"""Logging by hand, asking for the debrief later, and editing anything at all."""

from __future__ import annotations

from tests.conftest import MATH_MISTAKE, add_question


async def test_any_field_of_the_question_can_be_edited(client, session_factory):
    mistake_id = await add_question(session_factory, MATH_MISTAKE)

    updated = (
        await client.patch(
            f"/mistakes/{mistake_id}",
            json={
                "question_text": "If 3x + 7 = 22, solve for x.",
                "choices": ["3", "5"],
                "correct_answer": "5",
                "source": "Practice Test 4, Q18",
                "student_note": "Actually I misread the sign.",
                "subject": "Algebra",
            },
        )
    ).json()

    assert updated["question_text"] == "If 3x + 7 = 22, solve for x."
    assert updated["choices"] == ["3", "5"]
    assert updated["correct_answer"] == "5"
    assert updated["source"] == "Practice Test 4, Q18"
    assert updated["subject"] == "Algebra"


async def test_a_subject_can_be_cleared_by_editing(client, session_factory):
    mistake_id = await add_question(session_factory, MATH_MISTAKE)

    updated = (await client.patch(f"/mistakes/{mistake_id}", json={"subject": ""})).json()

    assert updated["subject"] is None


async def test_editing_one_field_leaves_the_others_alone(client, session_factory):
    mistake_id = await add_question(session_factory, MATH_MISTAKE)

    updated = (
        await client.patch(f"/mistakes/{mistake_id}", json={"student_note": "new note"})
    ).json()

    assert updated["student_note"] == "new note"
    assert updated["question_text"] == MATH_MISTAKE["question_text"]
    assert updated["correct_answer"] == MATH_MISTAKE["correct_answer"]


async def test_an_edit_cannot_blank_out_a_required_field(client, session_factory):
    mistake_id = await add_question(session_factory, MATH_MISTAKE)

    response = await client.patch(f"/mistakes/{mistake_id}", json={"question_text": "   "})

    assert response.status_code == 422


async def test_you_cannot_edit_another_students_question(client, session_factory):
    mistake_id = await add_question(session_factory, MATH_MISTAKE)

    response = await client.patch(
        f"/mistakes/{mistake_id}",
        json={"takeaway": "not yours"},
        headers={"X-User-Id": "someone-else"},
    )

    assert response.status_code == 404
