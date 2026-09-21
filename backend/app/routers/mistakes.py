"""Browsing and editing the questions in the bank."""

from __future__ import annotations

import io
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select

from ..analysis.base import AnalysisFailed
from ..analysis.scan import ScanInput, ScanKind, ScannedQuestion, get_scanner
from ..config import get_settings
from ..deps import SessionDep, UserDep
from ..filing import UnknownFolder, ensure_subject, file_into, resolve_folder
from ..images import ALLOWED_FORMATS, MAX_BYTES
from ..images import delete as delete_file
from ..models import Mistake, mistake_options
from ..query import BankQuery, run_query, text_filter
from ..schemas import MistakeRead, MistakeUpdate

router = APIRouter(prefix="/mistakes", tags=["mistakes"])

# A page of a practice test is a bigger PDF than a photo is a JPEG, so the two
# limits differ. The read cap is the larger of them; the kind is checked after.
MAX_SCAN_PDF_BYTES = 32 * 1024 * 1024
MAX_SCAN_BYTES = MAX_SCAN_PDF_BYTES


def _sniff_scan(data: bytes) -> tuple[ScanKind, str, bytes]:
    """Decide what was uploaded from the bytes, never the filename or declared type.

    Returns the bytes back because HEIC is re-encoded on the way through: Claude
    reads PNG, JPEG, GIF and WebP, and an iPhone screenshot is none of those.
    """
    if not data:
        raise HTTPException(status_code=422, detail="That file is empty.")

    if data.startswith(b"%PDF"):
        if len(data) > MAX_SCAN_PDF_BYTES:
            raise HTTPException(status_code=422, detail="That PDF is over the 32MB limit.")
        return "pdf", "application/pdf", data

    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
    except (UnidentifiedImageError, OSError, ValueError):
        image_format = None

    if image_format not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=415,
            detail="That is not a picture we can read. Send a PNG, JPEG, WebP, HEIC or PDF.",
        )
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=422, detail="That image is over the 10MB limit.")

    media_type = ALLOWED_FORMATS[image_format][0]
    if media_type == "image/heic":
        with Image.open(io.BytesIO(data)) as image:
            out = io.BytesIO()
            image.convert("RGB").save(out, format="JPEG", quality=90)
        return "image", "image/jpeg", out.getvalue()
    return "image", media_type, data


async def _folder(session, user_id: str, folder_id: str | None):
    """Resolve a folder id from a request body, as a 404 when it is not theirs."""
    try:
        return await resolve_folder(session, user_id, folder_id)
    except UnknownFolder as exc:
        raise HTTPException(status_code=404, detail="No such folder") from exc


@router.get("", response_model=list[MistakeRead])
async def list_mistakes(
    session: SessionDep,
    user_id: UserDep,
    subject: str | None = Query(
        default=None, description="A subject, matched as a whole string, ignoring case."
    ),
    topic: str | None = None,
    q: str | None = Query(
        default=None,
        description="Words to find. Every word must appear somewhere on the question - "
        "its text, source, answer, note or topic.",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[Mistake]:
    stmt = (
        select(Mistake)
        .where(Mistake.user_id == user_id)
        .options(*mistake_options())
        .order_by(Mistake.created_at.desc())
    )
    if subject is not None:
        stmt = stmt.where(func.lower(Mistake.subject) == subject.strip().lower())
    if topic is not None:
        stmt = stmt.where(Mistake.topic == topic)
    if q:
        # The same matcher the bank and the assistant use, so a search means the
        # same thing wherever it is typed.
        clause = text_filter(q)
        if clause is not None:
            stmt = stmt.where(clause)

    result = await session.scalars(stmt.limit(limit).offset(offset))
    return list(result)


async def _load(session: SessionDep, user_id: str, mistake_id: str) -> Mistake:
    mistake = await session.scalar(
        select(Mistake)
        .where(Mistake.id == mistake_id, Mistake.user_id == user_id)
        .options(*mistake_options())
    )
    if mistake is None:
        raise HTTPException(status_code=404, detail="No such mistake")
    return mistake


@router.post("/search", response_model=list[MistakeRead])
async def search(body: BankQuery, session: SessionDep, user_id: UserDep) -> list[Mistake]:
    """Filter the bank by any combination of facets.

    A POST because the filter is a structure, not a handful of scalars: each facet
    takes a list, OR within a list and AND across them. The same `BankQuery` the
    assistant produces, so the panel and the bank page cannot drift apart.
    """
    return await run_query(session, user_id, body)


@router.post("/scan", response_model=ScannedQuestion)
async def scan_question(
    file: Annotated[UploadFile, File()],
    subject: Annotated[str | None, Form()] = None,
) -> ScannedQuestion:
    """Read a picture of a question and return the log form, filled in.

    Sits above `/{mistake_id}` next to `/search`, for reading order rather than
    for correctness: no POST is declared on `/{mistake_id}`, so a method mismatch
    there is only a partial match and the router keeps looking regardless.

    Nothing is written and nothing is stored: this only answers with what the model
    read, and the student logs it themselves once they have checked it. The picture
    they dropped is uploaded separately, after the question exists.
    """
    data = await file.read(MAX_SCAN_BYTES + 1)
    kind, media_type, data = _sniff_scan(data)

    try:
        return await get_scanner().read(
            ScanInput(
                kind=kind,
                media_type=media_type,
                data=data,
                subject_hint=" ".join((subject or "").split())[:80] or None,
            )
        )
    except AnalysisFailed as exc:
        raise HTTPException(status_code=502, detail=f"Could not read that picture: {exc}") from exc


@router.get("/{mistake_id}", response_model=MistakeRead)
async def get_mistake(mistake_id: str, session: SessionDep, user_id: UserDep) -> Mistake:
    return await _load(session, user_id, mistake_id)


@router.patch("/{mistake_id}", response_model=MistakeRead)
async def update_mistake(
    mistake_id: str,
    body: MistakeUpdate,
    session: SessionDep,
    user_id: UserDep,
) -> Mistake:
    """Edit any field, the AI's included. Only the keys sent are changed."""
    mistake = await _load(session, user_id, mistake_id)

    fields = body.model_dump(exclude_unset=True)
    refiled = "folder_id" in fields
    folder = await _folder(session, user_id, fields.pop("folder_id", None))
    for field, value in fields.items():
        setattr(mistake, field, value)
    if refiled:
        file_into(mistake, folder)
    if "subject" in fields:
        await ensure_subject(session, user_id, mistake.subject)

    await session.commit()
    return mistake


@router.delete("/{mistake_id}", status_code=204)
async def delete_mistake(mistake_id: str, session: SessionDep, user_id: UserDep) -> None:
    """Deletes the question, its ladder, and the bytes of its pictures.

    The image rows cascade; the files on disk do not, so without this every deleted
    question leaves its pictures behind forever.
    """
    mistake = await _load(session, user_id, mistake_id)
    filenames = [image.filename for image in mistake.images]

    await session.delete(mistake)
    await session.commit()

    root = get_settings().upload_root
    for filename in filenames:
        delete_file(filename, root)
