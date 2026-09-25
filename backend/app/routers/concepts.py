"""Concepts: the things worth knowing, and the questions filed under them."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from ..analysis.base import AnalysisFailed
from ..analysis.card import CardInput, get_card_writer
from ..config import get_settings
from ..deps import SessionDep, UserDep
from ..filing import UnknownFolder, ensure_subject, file_into, resolve_folder
from ..images import MAX_BYTES, ImageRejected, store
from ..images import delete as delete_file
from ..models import (
    Concept,
    ConceptImage,
    Folder,
    Mistake,
    concept_mistakes,
    concept_options,
    mistake_options,
    utcnow,
)
from ..schemas import ConceptCreate, ConceptDetail, ConceptRead, ConceptUpdate

router = APIRouter(prefix="/concepts", tags=["concepts"])


async def _load(session, user_id: str, concept_id: str, *, with_mistakes: bool = False):
    stmt = select(Concept).where(Concept.id == concept_id, Concept.user_id == user_id)
    if with_mistakes:
        stmt = stmt.options(
            selectinload(Concept.mistakes).options(*mistake_options()),
            selectinload(Concept.images),
        )
    else:
        stmt = stmt.options(*concept_options())

    concept = await session.scalar(stmt)
    if concept is None:
        raise HTTPException(status_code=404, detail="No such concept")
    return concept


def _read(concept: Concept) -> ConceptRead:
    return ConceptRead(
        id=concept.id,
        created_at=concept.created_at,
        updated_at=concept.updated_at,
        title=concept.title,
        body=concept.body,
        subject=concept.subject,
        folder_id=concept.folder_id,
        parent_id=concept.parent_id,
        sequence=concept.sequence,
        when_label=concept.when_label,
        motif=concept.motif,
        card=concept.card,
        map_x=concept.map_x,
        map_y=concept.map_y,
        question_count=len(concept.mistakes),
        images=concept.images,
    )


async def _folder(session, user_id: str, folder_id: str | None):
    """Resolve a folder id from a request body, as a 404 when it is not theirs."""
    try:
        return await resolve_folder(session, user_id, folder_id)
    except UnknownFolder as exc:
        raise HTTPException(status_code=404, detail="No such folder") from exc


@router.post("", response_model=ConceptRead, status_code=201)
async def create_concept(body: ConceptCreate, session: SessionDep, user_id: UserDep) -> ConceptRead:
    fields = body.model_dump()
    folder = await _folder(session, user_id, fields.pop("folder_id", None))
    concept = Concept(user_id=user_id, **fields)
    # Same reason as a new question's concepts: a brand-new concept has no questions,
    # and `_read` counting them must not become a lazy load after the commit.
    # Both collections, for the same reason `blank_collections` exists for questions.
    concept.mistakes = []
    concept.images = []
    # The folder decides the subject; a subject typed without one still needs a tab.
    if folder is not None:
        file_into(concept, folder)
    else:
        await ensure_subject(session, user_id, concept.subject)
    session.add(concept)
    await session.commit()
    return _read(concept)


@router.get("", response_model=list[ConceptRead])
async def list_concepts(session: SessionDep, user_id: UserDep) -> list[ConceptRead]:
    """Concepts with their question counts, the ones you have tagged most first."""
    counts = dict(
        (
            await session.execute(
                select(concept_mistakes.c.concept_id, func.count()).group_by(
                    concept_mistakes.c.concept_id
                )
            )
        ).all()
    )
    concepts = await session.scalars(
        select(Concept)
        .where(Concept.user_id == user_id)
        .options(selectinload(Concept.images))
        .order_by(Concept.title)
    )
    reads = [
        ConceptRead(
            id=concept.id,
            created_at=concept.created_at,
            updated_at=concept.updated_at,
            title=concept.title,
            body=concept.body,
            subject=concept.subject,
            folder_id=concept.folder_id,
            parent_id=concept.parent_id,
            sequence=concept.sequence,
            when_label=concept.when_label,
            motif=concept.motif,
            card=concept.card,
            map_x=concept.map_x,
            map_y=concept.map_y,
            question_count=counts.get(concept.id, 0),
            images=concept.images,
        )
        for concept in concepts
    ]
    # Deliberately not sorted by `sequence`: it is a position among siblings, so
    # sorting one flat list by it would interleave every branch's first detail with
    # every other branch's first detail. The folder page and the map know the
    # grouping and order within it; this list is the busiest concepts first.
    return sorted(reads, key=lambda c: (-c.question_count, c.title.lower()))


@router.get("/{concept_id}", response_model=ConceptDetail)
async def get_concept(concept_id: str, session: SessionDep, user_id: UserDep) -> ConceptDetail:
    concept = await _load(session, user_id, concept_id, with_mistakes=True)
    return ConceptDetail(**_read(concept).model_dump(), mistakes=concept.mistakes)


@router.patch("/{concept_id}", response_model=ConceptRead)
async def update_concept(
    concept_id: str, body: ConceptUpdate, session: SessionDep, user_id: UserDep
) -> ConceptRead:
    concept = await _load(session, user_id, concept_id)
    fields = body.model_dump(exclude_unset=True)
    refiled = "folder_id" in fields
    folder = await _folder(session, user_id, fields.pop("folder_id", None))
    for field, value in fields.items():
        setattr(concept, field, value)
    if refiled:
        file_into(concept, folder)
    if "subject" in fields:
        await ensure_subject(session, user_id, concept.subject)
    concept.updated_at = utcnow()
    await session.commit()
    return _read(concept)


@router.delete("/{concept_id}", status_code=204)
async def delete_concept(concept_id: str, session: SessionDep, user_id: UserDep) -> None:
    """Deletes the concept, its tags and its diagrams. The questions are untouched.

    Anything nested under it is kept and promoted to the top level rather than
    deleted with it: the children are concepts in their own right, and losing
    "Battle of Yorktown" because "The American Revolution" was tidied away is the
    kind of silent destruction this app exists not to do.
    """
    concept = await _load(session, user_id, concept_id)
    filenames = [image.filename for image in concept.images]

    # SQLite runs no `ON DELETE` here - no connection sets `foreign_keys=ON`. The
    # ORM would in fact null these itself, having the relationship: this statement
    # is not what makes the behaviour correct today, and removing it breaks no
    # test. It is here so the behaviour does not depend on a cascade default that
    # a later `passive_deletes=True` would quietly reverse.
    await session.execute(
        update(Concept).where(Concept.parent_id == concept.id).values(parent_id=None)
    )
    await session.delete(concept)
    await session.commit()

    root = get_settings().upload_root
    for filename in filenames:
        delete_file(filename, root)


async def _own_mistake(session, user_id: str, mistake_id: str) -> Mistake:
    mistake = await session.scalar(
        select(Mistake).where(Mistake.id == mistake_id, Mistake.user_id == user_id)
    )
    if mistake is None:
        raise HTTPException(status_code=404, detail="No such question")
    return mistake


@router.post("/{concept_id}/questions/{mistake_id}", response_model=ConceptDetail)
async def tag_question(
    concept_id: str, mistake_id: str, session: SessionDep, user_id: UserDep
) -> ConceptDetail:
    """File a question under a concept. Tagging twice is not an error."""
    concept = await _load(session, user_id, concept_id, with_mistakes=True)
    mistake = await _own_mistake(session, user_id, mistake_id)

    if mistake not in concept.mistakes:
        concept.mistakes.append(mistake)
        await session.commit()
        concept = await _load(session, user_id, concept_id, with_mistakes=True)

    return ConceptDetail(**_read(concept).model_dump(), mistakes=concept.mistakes)


@router.delete("/{concept_id}/questions/{mistake_id}", response_model=ConceptDetail)
async def untag_question(
    concept_id: str, mistake_id: str, session: SessionDep, user_id: UserDep
) -> ConceptDetail:
    concept = await _load(session, user_id, concept_id, with_mistakes=True)
    mistake = await _own_mistake(session, user_id, mistake_id)

    if mistake in concept.mistakes:
        concept.mistakes.remove(mistake)
        await session.commit()
        concept = await _load(session, user_id, concept_id, with_mistakes=True)

    return ConceptDetail(**_read(concept).model_dump(), mistakes=concept.mistakes)


# --- pictures -----------------------------------------------------------------


@router.post("/{concept_id}/images", response_model=ConceptDetail, status_code=201)
async def upload_concept_image(
    concept_id: str,
    session: SessionDep,
    user_id: UserDep,
    file: Annotated[UploadFile, File()],
) -> ConceptDetail:
    """Attach a diagram to a concept. Ownership is checked before anything is written."""
    concept = await _load(session, user_id, concept_id, with_mistakes=True)

    data = await file.read(MAX_BYTES + 1)
    try:
        stored = store(data, get_settings().upload_root)
    except ImageRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    concept.images.append(
        ConceptImage(
            concept_id=concept.id,
            filename=stored.filename,
            content_type=stored.content_type,
            byte_size=stored.size,
            width=stored.width,
            height=stored.height,
            position=len(concept.images),
        )
    )
    await session.commit()

    concept = await _load(session, user_id, concept_id, with_mistakes=True)
    return ConceptDetail(**_read(concept).model_dump(), mistakes=concept.mistakes)


@router.delete("/{concept_id}/images/{image_id}", response_model=ConceptDetail)
async def delete_concept_image(
    concept_id: str, image_id: str, session: SessionDep, user_id: UserDep
) -> ConceptDetail:
    concept = await _load(session, user_id, concept_id, with_mistakes=True)

    image = next((found for found in concept.images if found.id == image_id), None)
    if image is None:
        raise HTTPException(status_code=404, detail="No such image")

    filename = image.filename
    concept.images.remove(image)
    await session.commit()
    delete_file(filename, get_settings().upload_root)

    concept = await _load(session, user_id, concept_id, with_mistakes=True)
    return ConceptDetail(**_read(concept).model_dump(), mistakes=concept.mistakes)


@router.post("/{concept_id}/card", response_model=ConceptDetail)
async def write_card(
    concept_id: str,
    session: SessionDep,
    user_id: UserDep,
    force: bool = False,
) -> ConceptDetail:
    """Write the revision card for a concept that has none.

    Concepts filed from now on arrive with one — the reading writes it while it
    has the whole material in front of it, which is the best moment to decide
    what the one line is. This is for everything filed before that, and for the
    concept you have since rewritten by hand.

    Kept once written. A card that comes back different every time it is looked
    at is one you cannot learn from, so rewriting is deliberate: `force=true`,
    from a button that says what it will do.

    The source is the concept's own body and the questions already filed under
    it. The questions matter more than they look: they are the evidence of how
    this concept actually gets asked, which is exactly what the exam cue and the
    trap are trying to name.
    """
    concept = await _load(session, user_id, concept_id, with_mistakes=True)

    if concept.card is not None and not force:
        raise HTTPException(
            status_code=409,
            detail="This concept already has a card. Send force=true to write it again.",
        )

    # Asked for by id rather than walked to through `concept.folder`. `_load`
    # with mistakes does not eager-load the folder, and touching an unloaded
    # relationship at this point raises MissingGreenlet — at the line that reads
    # it, not at the line that forgot to load it.
    folder_name = (
        await session.scalar(select(Folder.name).where(Folder.id == concept.folder_id))
        if concept.folder_id
        else None
    )
    writer = get_card_writer()
    try:
        card = await writer.write(
            CardInput(
                title=concept.title,
                body=concept.body or "",
                subject=concept.subject,
                unit=folder_name,
                questions=[
                    f"- {m.question_text} (answer: {m.correct_answer})"
                    for m in concept.mistakes[:12]
                ],
            )
        )
    except AnalysisFailed as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - one bad card must not 500 the page
        raise HTTPException(status_code=503, detail=f"{type(exc).__name__}: {exc}") from exc

    concept.card = card.model_dump()
    concept.updated_at = utcnow()
    await session.commit()

    concept = await _load(session, user_id, concept_id, with_mistakes=True)
    return ConceptDetail(**_read(concept).model_dump(), mistakes=concept.mistakes)
