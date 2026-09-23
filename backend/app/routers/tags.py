"""The student's own labels.

Deliberately plain strings rather than a table of their own: a tag has no life
beyond the questions carrying it. That is still true - deleting one is not a row
going away, it is the label coming off every question that carried it - but the
student does get to do it, because a label they can never be rid of is worse
than no labels at all.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy import select

from ..deps import SessionDep, UserDep
from ..models import Mistake

router = APIRouter(prefix="/tags", tags=["tags"])


class TagCount(BaseModel):
    tag: str
    count: int
    # True while nothing carries it - a starting suggestion rather than a tag the
    # student has actually chosen to use.
    suggested: bool = False


@router.get("", response_model=list[TagCount])
async def list_tags(session: SessionDep, user_id: UserDep) -> list[TagCount]:
    """Every tag in use, commonest first, then the unused suggestions."""
    rows = await session.scalars(
        select(Mistake.tags).where(Mistake.user_id == user_id, Mistake.tags.is_not(None))
    )

    counts: dict[str, int] = {}
    canonical: dict[str, str] = {}
    for tags in rows:
        for tag in tags or []:
            key = tag.casefold()
            canonical.setdefault(key, tag)
            counts[key] = counts.get(key, 0) + 1

    # No suggested list any more: the log form that offered one is gone, and the
    # tags that exist now are the ones a capture put on ("practice").
    return [
        TagCount(tag=canonical[key], count=count)
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


@router.delete("/{tag}", status_code=204)
async def delete_tag(
    session: SessionDep,
    user_id: UserDep,
    tag: str = Path(description="The label to take off every question carrying it."),
) -> None:
    """Take a label off the whole bank. The questions themselves are untouched.

    Matched case-insensitively, because "By mistake" and "by mistake" are one
    label everywhere else in the app and it would be a strange place to start
    treating them as two.

    Rewritten in Python rather than in SQL: `tags` is a JSON column, and the one
    expression that would do this in Postgres is not the one that would do it in
    SQLite. The number of questions carrying any single label is small.
    """
    wanted = " ".join(tag.split()).casefold()
    if not wanted:
        raise HTTPException(status_code=422, detail="That is not a label.")

    rows = await session.scalars(
        select(Mistake).where(Mistake.user_id == user_id, Mistake.tags.is_not(None))
    )
    for mistake in rows:
        kept = [label for label in (mistake.tags or []) if label.casefold() != wanted]
        if len(kept) != len(mistake.tags or []):
            # Null rather than an empty list, so "no labels" reads the same way
            # whether a question never had one or just lost its last.
            mistake.tags = kept or None
    await session.commit()
