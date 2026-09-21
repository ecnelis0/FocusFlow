"""Where a question, a concept or a material is filed: its folder, and the subject name it implies.

One module owns both fields because there are two of them for one fact. `folder_id`
is the hierarchy - Subject > Folder - and `subject` is the folder's subject *name*,
copied onto the row. The copy is not laziness: every filter in `query.py`, every
tally in `stats.py` and every analyzer prompt speaks in subject names, and a bank
whose subjects are only reachable through two joins would have meant rewriting all
of them.

The price of a copy is drift, so the rule is narrow and absolute:

    **The folder is authoritative. `subject` is its name. Nothing outside this
    module writes either field.**

`file_into` is the only way a row gets a folder, `rename_subject` is the only way a
subject's name changes, and `ensure_subject` guarantees that any subject name in the
bank has a row - so a tab never goes missing because a question was logged with a
subject nobody had created yet.
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import Concept, Folder, Material, Mistake, Subject, new_id, utcnow


def tidy(value: str | None) -> str | None:
    """Trim a name; blank means absent, not an empty string."""
    if value is None:
        return None
    return " ".join(value.split()) or None


async def find_subject(session: AsyncSession, user_id: str, name: str) -> Subject | None:
    """The student's subject by name, case-insensitively.

    Case-insensitive because "apush" and "APUSH" are one course, and two tabs for
    one course is the failure the whole hierarchy exists to prevent.
    """
    clean = tidy(name)
    if clean is None:
        return None
    return await session.scalar(
        select(Subject).where(
            Subject.user_id == user_id, func.lower(Subject.name) == clean.lower()
        )
    )


async def ensure_subject(session: AsyncSession, user_id: str, name: str | None) -> Subject | None:
    """The subject row for this name, created if the student has not made it yet.

    Called wherever a subject name is written by something other than the subjects
    API - logging a question, editing a concept, committing a capture. Without it a
    subject could exist on fifty questions and still have no tab.

    Does not commit: the caller's transaction decides.
    """
    clean = tidy(name)
    if clean is None:
        return None
    found = await find_subject(session, user_id, clean)
    if found is not None:
        return found

    # Appended to the end of the tab strip rather than sorted in: a subject that
    # appears in the middle of the row you were reading is a subject you miss.
    last = await session.scalar(
        select(func.max(Subject.position)).where(Subject.user_id == user_id)
    )
    subject = Subject(
        id=new_id(),
        user_id=user_id,
        created_at=utcnow(),
        name=clean,
        position=(last or 0) + 1,
    )
    subject.folders = []
    session.add(subject)
    await session.flush()
    return subject


class UnknownFolder(Exception):
    """A folder id that is not this student's. Routers turn it into a 404.

    An exception rather than a returned None because "no folder" and "a folder you
    do not own" must not be the same answer: the first unfiles, the second is an
    attempt to file into someone else's bank.
    """


async def resolve_folder(
    session: AsyncSession, user_id: str, folder_id: str | None
) -> Folder | None:
    """The folder to file into, with its subject loaded ready for `file_into`."""
    if folder_id is None:
        return None
    folder = await session.scalar(
        select(Folder)
        .where(Folder.id == folder_id, Folder.user_id == user_id)
        .options(selectinload(Folder.subject))
    )
    if folder is None:
        raise UnknownFolder(folder_id)
    return folder


async def reconcile_subjects(session: AsyncSession, user_id: str) -> None:
    """Give every subject name in the bank a row, so no course can lose its tab.

    `ensure_subject` covers writes that go through the API and the migration covers
    the one-time upgrade, but neither covers a row that arrived any other way - a
    seed script, a restore, an import. A question carrying a subject nobody has a
    row for is not merely untidy: with the bank drawn as tabs, it has no tab to
    appear under, and "my Spanish questions are gone" is the report you get.

    Cheap enough to run on every read of the strip: one grouped query, and an
    INSERT only in the case that would otherwise have lost a tab.
    """
    names = await session.scalars(
        select(Mistake.subject)
        .where(Mistake.user_id == user_id, Mistake.subject.is_not(None))
        .union(
            select(Concept.subject).where(
                Concept.user_id == user_id, Concept.subject.is_not(None)
            )
        )
    )
    known = {
        name.lower()
        for name in await session.scalars(
            select(Subject.name).where(Subject.user_id == user_id)
        )
    }

    added = False
    for name in names:
        if name.lower() in known:
            continue
        known.add(name.lower())
        await ensure_subject(session, user_id, name)
        added = True
    if added:
        await session.commit()


def file_into(row: Concept | Mistake | Material, folder: Folder | None) -> None:
    """Put a row in a folder, and give it that folder's subject name.

    Passing None unfiles it from its folder and leaves the subject alone: "this is
    not in a unit yet" and "this is not in a course" are different statements, and
    dragging something out of a folder should not lose which course it was for.
    """
    if folder is None:
        row.folder_id = None
        return
    row.folder_id = folder.id
    row.subject = folder.subject.name


async def rename_subject(session: AsyncSession, user_id: str, subject: Subject, name: str) -> None:
    """Rename a subject and carry the new name to every row that copied the old one.

    The copy is what makes this a two-step operation. Forget the second step and
    the bank keeps filtering on a name no tab shows any more.
    """
    clean = tidy(name)
    if clean is None or clean == subject.name:
        return
    was = subject.name
    subject.name = clean
    for model in (Mistake, Concept, Material):
        await session.execute(
            update(model)
            .where(model.user_id == user_id, func.lower(model.subject) == was.lower())
            .values(subject=clean)
        )


async def empty_folders(session: AsyncSession, user_id: str, folder_ids: list[str]) -> None:
    """Unfile every row sitting in these folders, before the folders are deleted.

    Done in Python, not by the `ON DELETE SET NULL` on the column: this app runs on
    SQLite, which ignores foreign keys entirely unless `PRAGMA foreign_keys=ON` is
    issued per connection, and nothing here issues it. Leaving it to the database
    would leave every question pointing at a folder id that no longer exists - and
    it would look right in development until the day the app moved to Postgres.
    """
    if not folder_ids:
        return
    for model in (Mistake, Concept, Material):
        await session.execute(
            update(model)
            .where(model.user_id == user_id, model.folder_id.in_(folder_ids))
            .values(folder_id=None)
        )


async def unfile_subject(session: AsyncSession, user_id: str, subject: Subject) -> None:
    """Clear a deleted subject off its rows, so no tab-less ghost is left behind.

    The questions and concepts survive - only where they were filed is lost.
    """
    await empty_folders(session, user_id, [folder.id for folder in subject.folders])
    for model in (Mistake, Concept, Material):
        await session.execute(
            update(model)
            .where(model.user_id == user_id, func.lower(model.subject) == subject.name.lower())
            .values(subject=None)
        )
