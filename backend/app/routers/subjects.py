"""Subjects and the topic folders inside them - the shape of the bank.

A subject is a course ("APUSH", "SAT", "Calculus") and shows as a tab. A folder is
a topic inside one, and holds both halves of the bank: the concepts filed under
that topic and the questions logged against it.

Both are the student's own structure, so both are rows rather than strings found by
grouping: an empty subject has to be able to exist, because you set your courses up
before you log anything into them.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from ..deps import SessionDep, UserDep
from ..filing import empty_folders, find_subject, rename_subject, unfile_subject
from ..models import Concept, Folder, Mistake, Subject, new_id, utcnow
from ..schemas import (
    FolderCreate,
    FolderRead,
    FolderUpdate,
    SubjectCreate,
    SubjectRead,
    SubjectUpdate,
)

router = APIRouter(prefix="/subjects", tags=["subjects"])
folders_router = APIRouter(prefix="/folders", tags=["subjects"])


class Counts:
    """How many concepts and questions sit in each folder, and loose in each subject.

    Counted for the whole bank in four queries rather than per folder: a student
    with six subjects of eight units each would otherwise cost fifty round trips to
    draw one tab strip.
    """

    def __init__(
        self,
        by_folder_questions: dict[str, int],
        by_folder_concepts: dict[str, int],
        by_subject_questions: dict[str, int],
        by_subject_concepts: dict[str, int],
    ) -> None:
        self.folder_questions = by_folder_questions
        self.folder_concepts = by_folder_concepts
        self.subject_questions = by_subject_questions
        self.subject_concepts = by_subject_concepts


async def _counts(session, user_id: str) -> Counts:
    async def by_folder(model) -> dict[str, int]:
        rows = await session.execute(
            select(model.folder_id, func.count())
            .where(model.user_id == user_id, model.folder_id.is_not(None))
            .group_by(model.folder_id)
        )
        return {folder_id: count for folder_id, count in rows.all()}

    async def by_subject(model) -> dict[str, int]:
        # Keyed case-insensitively, because the name on a row is a copy and a
        # subject renamed to a different capitalisation must still match its rows.
        rows = await session.execute(
            select(func.lower(model.subject), func.count())
            .where(model.user_id == user_id, model.subject.is_not(None))
            .group_by(func.lower(model.subject))
        )
        return {name: count for name, count in rows.all()}

    return Counts(
        await by_folder(Mistake),
        await by_folder(Concept),
        await by_subject(Mistake),
        await by_subject(Concept),
    )


def _read(subject: Subject, counts: Counts) -> SubjectRead:
    folders = [
        FolderRead(
            id=folder.id,
            subject_id=folder.subject_id,
            name=folder.name,
            position=folder.position,
            created_at=folder.created_at,
            concept_count=counts.folder_concepts.get(folder.id, 0),
            question_count=counts.folder_questions.get(folder.id, 0),
        )
        for folder in subject.folders
    ]
    key = subject.name.lower()
    questions = counts.subject_questions.get(key, 0)
    concepts = counts.subject_concepts.get(key, 0)
    return SubjectRead(
        id=subject.id,
        name=subject.name,
        position=subject.position,
        created_at=subject.created_at,
        folders=folders,
        concept_count=concepts,
        question_count=questions,
        # Everything under the subject, minus everything in one of its folders. A
        # row cannot be in a folder without carrying that folder's subject name, so
        # the subtraction is exact - see the rule in `filing.py`.
        unfiled_concept_count=concepts - sum(f.concept_count for f in folders),
        unfiled_question_count=questions - sum(f.question_count for f in folders),
    )


async def _load(session, user_id: str, subject_id: str) -> Subject:
    subject = await session.scalar(
        select(Subject)
        .where(Subject.id == subject_id, Subject.user_id == user_id)
        .options(selectinload(Subject.folders))
    )
    if subject is None:
        raise HTTPException(status_code=404, detail="No such subject")
    return subject


async def _load_folder(session, user_id: str, folder_id: str) -> Folder:
    folder = await session.scalar(
        select(Folder)
        .where(Folder.id == folder_id, Folder.user_id == user_id)
        .options(selectinload(Folder.subject))
    )
    if folder is None:
        raise HTTPException(status_code=404, detail="No such folder")
    return folder


@router.get("", response_model=list[SubjectRead])
async def list_subjects(session: SessionDep, user_id: UserDep) -> list[SubjectRead]:
    """Every subject with its folders and their counts - one request, the whole strip."""
    subjects = await session.scalars(
        select(Subject)
        .where(Subject.user_id == user_id)
        .options(selectinload(Subject.folders))
        .order_by(Subject.position, Subject.name)
    )
    counts = await _counts(session, user_id)
    return [_read(subject, counts) for subject in subjects]


@router.post("", response_model=SubjectRead, status_code=201)
async def create_subject(
    body: SubjectCreate, session: SessionDep, user_id: UserDep
) -> SubjectRead:
    if await find_subject(session, user_id, body.name) is not None:
        raise HTTPException(
            status_code=409, detail=f"You already have a subject called {body.name}"
        )

    last = await session.scalar(
        select(func.max(Subject.position)).where(Subject.user_id == user_id)
    )
    # id and created_at set here rather than by the INSERT default: `_read`
    # serialises the row before the commit, and a None id fails validation.
    subject = Subject(
        id=new_id(),
        user_id=user_id,
        created_at=utcnow(),
        name=body.name,
        position=(last or 0) + 1,
    )
    subject.folders = []
    session.add(subject)
    await session.commit()
    return _read(subject, await _counts(session, user_id))


@router.patch("/{subject_id}", response_model=SubjectRead)
async def update_subject(
    subject_id: str, body: SubjectUpdate, session: SessionDep, user_id: UserDep
) -> SubjectRead:
    """Rename or reorder. A rename carries the new name to every row that copied it."""
    subject = await _load(session, user_id, subject_id)

    if body.name is not None and body.name.lower() != subject.name.lower():
        clash = await find_subject(session, user_id, body.name)
        if clash is not None:
            raise HTTPException(
                status_code=409, detail=f"You already have a subject called {body.name}"
            )
    if body.name is not None:
        await rename_subject(session, user_id, subject, body.name)
    if body.position is not None:
        subject.position = body.position

    await session.commit()
    subject = await _load(session, user_id, subject_id)
    return _read(subject, await _counts(session, user_id))


@router.delete("/{subject_id}", status_code=204)
async def delete_subject(subject_id: str, session: SessionDep, user_id: UserDep) -> None:
    """Deletes the subject and its folders. Questions and concepts survive, unfiled."""
    subject = await _load(session, user_id, subject_id)
    await unfile_subject(session, user_id, subject)
    await session.delete(subject)
    await session.commit()


@router.post("/{subject_id}/folders", response_model=SubjectRead, status_code=201)
async def create_folder(
    subject_id: str, body: FolderCreate, session: SessionDep, user_id: UserDep
) -> SubjectRead:
    """Add a topic folder. Returns the whole subject, so the strip redraws from one call."""
    subject = await _load(session, user_id, subject_id)
    if any(folder.name.lower() == body.name.lower() for folder in subject.folders):
        raise HTTPException(
            status_code=409, detail=f"{subject.name} already has a folder called {body.name}"
        )

    last = max((folder.position for folder in subject.folders), default=0)
    session.add(
        Folder(
            id=new_id(),
            user_id=user_id,
            subject_id=subject.id,
            created_at=utcnow(),
            name=body.name,
            position=last + 1,
        )
    )
    await session.commit()
    subject = await _load(session, user_id, subject_id)
    return _read(subject, await _counts(session, user_id))


@folders_router.patch("/{folder_id}", response_model=FolderRead)
async def update_folder(
    folder_id: str, body: FolderUpdate, session: SessionDep, user_id: UserDep
) -> FolderRead:
    """Rename, reorder, or move the folder to another subject.

    Moving carries everything in it: each row's subject name is the folder's, so
    the rows are rewritten rather than left claiming a course they are no longer in.
    """
    folder = await _load_folder(session, user_id, folder_id)
    target = folder.subject

    if body.subject_id is not None and body.subject_id != folder.subject_id:
        target = await _load(session, user_id, body.subject_id)

    name = body.name or folder.name
    siblings = await session.scalars(
        select(Folder).where(
            Folder.subject_id == target.id, Folder.user_id == user_id, Folder.id != folder.id
        )
    )
    if any(sibling.name.lower() == name.lower() for sibling in siblings):
        raise HTTPException(
            status_code=409, detail=f"{target.name} already has a folder called {name}"
        )

    folder.name = name
    folder.subject_id = target.id
    if body.position is not None:
        folder.position = body.position

    # Written unconditionally rather than only on a move. Rewriting a row's subject
    # to the name it already has costs one statement; working out whether the move
    # happened means tracking the folder's old subject through the reassignment
    # above, and getting that wrong leaves rows claiming a course they left.
    for model in (Mistake, Concept):
        await session.execute(
            update(model)
            .where(model.user_id == user_id, model.folder_id == folder.id)
            .values(subject=target.name)
        )

    await session.commit()
    folder = await _load_folder(session, user_id, folder_id)
    counts = await _counts(session, user_id)
    return FolderRead(
        id=folder.id,
        subject_id=folder.subject_id,
        name=folder.name,
        position=folder.position,
        created_at=folder.created_at,
        concept_count=counts.folder_concepts.get(folder.id, 0),
        question_count=counts.folder_questions.get(folder.id, 0),
    )


@folders_router.delete("/{folder_id}", status_code=204)
async def delete_folder(folder_id: str, session: SessionDep, user_id: UserDep) -> None:
    """Deletes the folder. What was in it stays in the subject, unfiled."""
    folder = await _load_folder(session, user_id, folder_id)
    await empty_folders(session, user_id, [folder.id])
    await session.delete(folder)
    await session.commit()
