"""What the student put in, and what came out of each of it.

A folder holds concepts and questions, but a student coming back to a unit asks
"what have I put in here", not "list me forty concepts". A material is the
receipt for one capture, and listing them is how a folder is read.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..analysis.base import AnalysisFailed
from ..analysis.notes import NoteDocument, NoteInput, get_note_writer
from ..deps import SessionDep, UserDep
from ..models import Concept, Material, mistake_options, utcnow
from ..schemas import MaterialDetail, MaterialRead
from .concepts import _read as _read_concept

router = APIRouter(prefix="/materials", tags=["materials"])


def _summarise(material: Material) -> MaterialRead:
    return MaterialRead(
        id=material.id,
        created_at=material.created_at,
        title=material.title,
        kind=material.kind,
        source=material.source,
        summary=material.summary,
        subject=material.subject,
        folder_id=material.folder_id,
        concept_count=len(material.concepts),
        question_count=len(material.questions),
        has_notes=material.notes is not None,
    )


@router.get("", response_model=list[MaterialRead])
async def list_materials(
    session: SessionDep,
    user_id: UserDep,
    folder_id: str | None = Query(default=None, description="Only what was filed in this folder."),
    subject: str | None = Query(default=None, description="Only this subject, matched exactly."),
) -> list[MaterialRead]:
    stmt = (
        select(Material)
        .where(Material.user_id == user_id)
        .options(selectinload(Material.concepts), selectinload(Material.questions))
        # Newest first: the thing you just put in is the thing you are looking for.
        .order_by(Material.created_at.desc())
    )
    if folder_id is not None:
        stmt = stmt.where(Material.folder_id == folder_id)
    if subject is not None:
        stmt = stmt.where(Material.subject == subject)
    return [_summarise(material) for material in await session.scalars(stmt)]


@router.get("/{material_id}", response_model=MaterialDetail)
async def get_material(material_id: str, session: SessionDep, user_id: UserDep) -> MaterialDetail:
    material = await session.scalar(
        select(Material)
        .where(Material.id == material_id, Material.user_id == user_id)
        .options(
            selectinload(Material.concepts).selectinload(Concept.images),
            selectinload(Material.concepts).selectinload(Concept.mistakes),
            selectinload(Material.questions).options(*mistake_options()),
        )
    )
    if material is None:
        raise HTTPException(status_code=404, detail="No such material")
    return MaterialDetail(
        **_summarise(material).model_dump(),
        concepts=[_read_concept(concept) for concept in material.concepts],
        questions=material.questions,
    )


async def _load(session, user_id: str, material_id: str) -> Material:
    material = await session.scalar(
        select(Material)
        .where(Material.id == material_id, Material.user_id == user_id)
        .options(selectinload(Material.concepts), selectinload(Material.questions))
    )
    if material is None:
        raise HTTPException(status_code=404, detail="No such material")
    return material


@router.get("/{material_id}/notes", response_model=NoteDocument | None)
async def read_notes(material_id: str, session: SessionDep, user_id: UserDep):
    """The written-up page, or null if it has not been asked for yet.

    Null rather than a 404: "no notes written yet" is an ordinary state of a
    material, and the page that shows it needs to tell that apart from a
    material that is not there.
    """
    material = await _load(session, user_id, material_id)
    return material.notes


@router.post("/{material_id}/notes", response_model=NoteDocument)
async def write_notes(
    material_id: str,
    session: SessionDep,
    user_id: UserDep,
    force: bool = Query(
        default=False,
        description="Write them again even if there are notes already. Without it, "
        "existing notes are returned untouched.",
    ),
):
    """Write the revision page for this material, from what was filed off it.

    Kept once written. Re-running by accident would hand back a different page
    for the same material, and a revision page that rewrites itself is one you
    cannot come back to - so the second call returns the first call's notes
    unless `force` says otherwise.
    """
    material = await _load(session, user_id, material_id)
    if material.notes is not None and not force:
        return material.notes

    if not material.concepts:
        raise HTTPException(
            status_code=422,
            detail="There is nothing filed from this material to write notes from.",
        )

    writer = get_note_writer()
    try:
        document = await writer.write(
            NoteInput(
                title=material.title,
                kind=material.kind,
                summary=material.summary,
                subject=material.subject,
                concepts=[
                    f"{concept.title} — {' '.join((concept.body or '').split())}"
                    for concept in material.concepts
                ],
                questions=[
                    f"Q: {question.question_text} A: {question.correct_answer}"
                    for question in material.questions
                ],
            )
        )
    except AnalysisFailed as exc:
        raise HTTPException(status_code=502, detail=f"Could not write the notes: {exc}") from exc

    material.notes = document.model_dump()
    material.notes_written_at = utcnow()
    await session.commit()
    return document


@router.delete("/{material_id}", status_code=204)
async def delete_material(material_id: str, session: SessionDep, user_id: UserDep) -> None:
    """Throw away the record of an upload. What came out of it stays.

    The same rule the rest of the app files under: losing where something came
    from is bad, losing the concept is unthinkable. So the concepts and questions
    survive - they keep their folder, and the folder lists them as filed directly
    rather than under a material.

    Both links are left to SQLAlchemy rather than cut by hand here. That is the
    opposite of the rule for folders and subjects, and for a reason: those unfile
    rows by a bulk `UPDATE ... WHERE folder_id IN (...)`, which never loads them,
    so nothing would notice the change. A deleted ORM object does get noticed -
    the session nulls the foreign key on a loaded one-to-many and deletes the
    rows of a `secondary` table itself. Cutting them again by hand was two lines
    that no sabotage could make fail, which is the definition of not being
    load-bearing. The test below is what guards the behaviour.
    """
    material = await _load(session, user_id, material_id)

    await session.delete(material)
    await session.commit()
