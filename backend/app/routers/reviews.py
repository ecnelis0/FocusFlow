"""The review queue: what is due now, what is coming, and marking a rung done."""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..deps import SessionDep, UserDep
from ..models import Mistake, ReviewEvent, ReviewOutcome, mistake_options, utcnow
from ..review import URGENCY_RANK, restart_ladder
from ..schemas import (
    DueReview,
    ReviewAnswer,
    ReviewAnswerResult,
    ReviewComplete,
    ReviewCompleteResult,
)

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _open_for_user(user_id: str):
    return (
        select(ReviewEvent)
        .join(Mistake)
        .where(Mistake.user_id == user_id, ReviewEvent.completed_at.is_(None))
        .options(selectinload(ReviewEvent.mistake).options(*mistake_options()))
    )


@router.get("/due", response_model=list[DueReview])
async def due_now(
    session: SessionDep,
    user_id: UserDep,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[DueReview]:
    """Rungs whose time has come, most urgent first, then oldest.

    Everything here is already due, so the question to put in front of the student
    is the one that matters most - not merely the one that ripened first.
    """
    stmt = (
        _open_for_user(user_id)
        .where(ReviewEvent.due_at <= utcnow())
        .order_by(URGENCY_RANK, ReviewEvent.due_at)
        .limit(limit)
    )
    events = await session.scalars(stmt)
    return [DueReview(review=e, mistake=e.mistake) for e in events]


@router.get("/upcoming", response_model=list[DueReview])
async def upcoming(
    session: SessionDep,
    user_id: UserDep,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[DueReview]:
    stmt = (
        _open_for_user(user_id)
        .where(ReviewEvent.due_at > utcnow())
        .order_by(ReviewEvent.due_at)
        .limit(limit)
    )
    events = await session.scalars(stmt)
    return [DueReview(review=e, mistake=e.mistake) for e in events]


def _normalise(value: str) -> str:
    """Case, spacing and trailing punctuation do not make an answer wrong."""
    text = re.sub(r"\s+", " ", value.strip().casefold())
    text = text.strip(" .;:!")
    # "36π" and "36 pi", "x^2" and "x²": the common ways the same answer is typed.
    for a, b in (("pi", "π"), ("^2", "²"), ("^3", "³"), ("**", "^"), ("×", "*"), ("−", "-")):
        text = text.replace(a, b)
    return re.sub(r"\s+", "", text)


def is_correct(answer: str, mistake: Mistake) -> bool:
    """Does the answer match? A choice can be given as its letter or its text."""
    given = _normalise(answer)
    if not given:
        return False
    if given == _normalise(mistake.correct_answer):
        return True
    if mistake.choices:
        letters = {chr(97 + i): choice for i, choice in enumerate(mistake.choices)}
        picked = letters.get(given)
        if picked is not None and _normalise(picked) == _normalise(mistake.correct_answer):
            return True
        # The stored correct answer may itself be a letter.
        index = ord(_normalise(mistake.correct_answer)[:1]) - 97
        if (
            len(_normalise(mistake.correct_answer)) == 1
            and 0 <= index < len(mistake.choices)
            and given == _normalise(mistake.choices[index])
        ):
            return True
    return False


async def _load_open(session, user_id: str, review_id: str) -> ReviewEvent:
    event = await session.scalar(
        select(ReviewEvent)
        .join(Mistake)
        .where(ReviewEvent.id == review_id, Mistake.user_id == user_id)
        .options(selectinload(ReviewEvent.mistake).options(*mistake_options()))
    )
    if event is None:
        raise HTTPException(status_code=404, detail="No such review")
    if event.completed_at is not None:
        raise HTTPException(status_code=409, detail="That review is already completed")
    return event


@router.post("/{review_id}/answer", response_model=ReviewAnswerResult)
async def answer(
    review_id: str,
    body: ReviewAnswer,
    session: SessionDep,
    user_id: UserDep,
) -> ReviewAnswerResult:
    """Answer the question and let the server mark it.

    Right leaves the ladder alone; wrong restarts it from now, exactly as a
    self-reported miss does. The verdict and the real answer come back together.
    """
    event = await _load_open(session, user_id, review_id)
    mistake = event.mistake
    correct = is_correct(body.answer, mistake)

    event.completed_at = utcnow()
    event.outcome = ReviewOutcome.correct if correct else ReviewOutcome.wrong
    if not correct:
        restart_ladder(mistake)
    await session.commit()

    remaining = [e.due_at for e in mistake.reviews if e.completed_at is None]
    return ReviewAnswerResult(
        review=event,
        ladder_restarted=not correct,
        next_due_at=min(remaining, default=None),
        correct=correct,
        your_answer=body.answer.strip(),
        correct_answer=mistake.correct_answer,
    )


@router.post("/{review_id}/complete", response_model=ReviewCompleteResult)
async def complete(
    review_id: str,
    body: ReviewComplete,
    session: SessionDep,
    user_id: UserDep,
) -> ReviewCompleteResult:
    """Record how the review went.

    Getting it right or skipping leaves the rest of the ladder alone. Getting it wrong
    again restarts the ladder from now - see `app/review.py`.
    """
    event = await session.scalar(
        select(ReviewEvent)
        .join(Mistake)
        .where(ReviewEvent.id == review_id, Mistake.user_id == user_id)
        .options(selectinload(ReviewEvent.mistake).options(*mistake_options()))
    )
    if event is None:
        raise HTTPException(status_code=404, detail="No such review")
    if event.completed_at is not None:
        raise HTTPException(status_code=409, detail="That review is already completed")

    event.completed_at = utcnow()
    event.outcome = body.outcome

    restarted = body.outcome is ReviewOutcome.wrong
    if restarted:
        restart_ladder(event.mistake)

    await session.commit()

    remaining = [e.due_at for e in event.mistake.reviews if e.completed_at is None]
    return ReviewCompleteResult(
        review=event,
        ladder_restarted=restarted,
        next_due_at=min(remaining, default=None),
    )
