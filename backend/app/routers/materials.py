"""What the student put in, and what came out of each of it.

A folder holds concepts and questions, but a student coming back to a unit asks
"what have I put in here", not "list me forty concepts". A material is the
receipt for one capture, and listing them is how a folder is read.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..deps import SessionDep, UserDep
from ..models import Concept, Material, mistake_options
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
