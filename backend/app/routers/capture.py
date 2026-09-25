"""Scan notes or a recording, and file what they contain as concepts.

One endpoint, four kinds of input: a photo of handwritten notes, a PDF, a block of
pasted text, or an audio recording. The kind is decided from the bytes, never from
the filename or the declared type. Audio is transcribed locally first; then the
extractor reads the material and returns every concept it contains, with a
description of each. Nothing is written yet: the student sees the list, edits it,
and approves it, and only then does `POST /capture/commit` file the concepts -
merged into an existing concept when the student keeps the model's match, created
otherwise. A picture is attached to every concept it produced, so the original
stays next to the AI's reading of it.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..analysis.base import AnalysisFailed
from ..analysis.extract import (
    CaptureExtraction,
    CaptureInput,
    CaptureKind,
    ExistingConcept,
    get_extractor,
)
from ..config import get_settings
from ..deps import SessionDep, UserDep
from ..filing import UnknownFolder, ensure_subject, file_into, resolve_folder
from ..images import ALLOWED_FORMATS, MAX_BYTES, ImageRejected, store, upload_dir
from ..images import delete as delete_file
from ..models import (
    Concept,
    ConceptImage,
    Folder,
    Material,
    Mistake,
    blank_collections,
    mistake_options,
    new_id,
    utcnow,
)
from ..schemas import ConceptRead, MistakeRead
from ..transcribe import (
    AUDIO_TYPES,
    MAX_AUDIO_BYTES,
    TranscriptionFailed,
    TranscriptionUnavailable,
    get_transcriber,
)
from ..youtube import VideoUnavailable, fetch_transcript
from .concepts import _read

router = APIRouter(prefix="/capture", tags=["capture"])

MAX_TEXT_BYTES = 200 * 1024
MAX_PDF_BYTES = 32 * 1024 * 1024


class ConceptChange(BaseModel):
    concept: ConceptRead
    # Where the new material went: a brand-new concept, or one that already existed.
    action: str  # "created" | "updated"


class ProposedConcept(BaseModel):
    """One concept the model found, as the student sees it before approving."""

    title: str
    body: str
    subject: str | None
    # The title of the broader concept this sits under, from this same proposal.
    # Null for one of the branches the map is built around.
    parent_title: str | None
    # Where this sits in the order the material runs, among its own siblings.
    order: int = 0
    # What that position is called - "1763", "Step 2" - when the material says.
    when: str | None = None
    # Where in the notes it came from ("page 3"), when the model could tell.
    where: str | None
    # The existing concept the model says this is, if any. The student can drop it.
    existing_id: str | None
    existing_title: str | None


class ProposedQuestion(BaseModel):
    question_text: str
    choices: list[str] | None
    correct_answer: str
    # The proposed concept's title (from `concepts` in the same proposal).
    concept_title: str
    where: str | None
    # "material" when posed in the notes; "generated" when the model wrote it.
    origin: str = "material"


class CaptureProposal(BaseModel):
    kind: CaptureKind
    # The video's title, when the notes came from a YouTube link.
    title: str | None = None
    extractor: str
    transcript: str | None
    summary: str
    concepts: list[ProposedConcept]
    questions: list[ProposedQuestion] = []
    # A stored copy of the picture, to attach on commit. Never a client-chosen name.
    image_filename: str | None


class ApprovedConcept(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = ""
    subject: str | None = Field(default=None, max_length=80)
    # The title of the concept this nests under - one of the others being approved,
    # or one already in the bank. Resolved by title after every row exists.
    parent_title: str | None = Field(default=None, max_length=200)
    # The student can reorder before approving, so this comes back from the client
    # rather than being read off the proposal again.
    order: int = Field(default=0, ge=0, le=10_000)
    when: str | None = Field(default=None, max_length=60)
    existing_id: str | None = None


class ApprovedQuestion(BaseModel):
    question_text: str = Field(min_length=1)
    choices: list[str] | None = None
    correct_answer: str = Field(min_length=1)
    # Titles of approved concepts (or existing ones) to file it under.
    concept_titles: list[str] = Field(default_factory=list)
    origin: str = "material"


class CaptureCommit(BaseModel):
    concepts: list[ApprovedConcept]
    questions: list[ApprovedQuestion] = Field(default_factory=list)
    # The folder chosen before the material was read. Everything this capture files
    # lands there - concepts and practice questions alike - and takes its subject
    # from it, overriding whatever subject the model proposed.
    folder_id: str | None = None
    image_filename: str | None = None
    # Where the material came from, kept as each question's source.
    source: str | None = Field(default=None, max_length=200)
    # What to call this material in the folder that now holds it. The page sends
    # back the video's title or the file's name; blank falls back to the kind.
    title: str | None = Field(default=None, max_length=200)
    # The course, when no folder is chosen. Ignored when one is: the folder's own
    # subject is authoritative and `filing.py` writes it.
    subject: str | None = Field(default=None, max_length=80)
    kind: str = Field(default="text", max_length=16)
    # The extractor's summary of the whole thing, shown under the title.
    summary: str | None = None


class CaptureResult(BaseModel):
    changes: list[ConceptChange]
    # Practice questions logged into the bank, tagged under their concepts.
    questions: list[MistakeRead] = []
    # The record of this capture, which is what a folder lists.
    material_id: str | None = None


class Sniffed(BaseModel):
    kind: CaptureKind
    media_type: str | None = None
    text: str | None = None


def _sniff(data: bytes, filename: str | None, declared: str | None) -> Sniffed:
    """Decide what was uploaded from the bytes. The filename only breaks audio ties."""
    if not data:
        raise HTTPException(status_code=422, detail="The file is empty.")

    if data.startswith(b"%PDF"):
        if len(data) > MAX_PDF_BYTES:
            raise HTTPException(status_code=422, detail="That PDF is over the 32MB limit.")
        return Sniffed(kind="pdf", media_type="application/pdf")

    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
    except (UnidentifiedImageError, OSError, ValueError):
        image_format = None
    if image_format in ALLOWED_FORMATS:
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=422, detail="That image is over the 10MB limit.")
        media_type = ALLOWED_FORMATS[image_format][0]
        # Claude reads PNG, JPEG, GIF and WebP; HEIC is re-encoded so it still works.
        if media_type == "image/heic":
            with Image.open(io.BytesIO(data)) as image:
                out = io.BytesIO()
                image.convert("RGB").save(out, format="JPEG", quality=90)
                data = out.getvalue()
            media_type = "image/jpeg"
        return Sniffed(kind="image", media_type=media_type)

    suffix = Path(filename or "").suffix.lower()
    if suffix in AUDIO_TYPES or (declared or "").startswith(("audio/", "video/webm")):
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=422, detail="That recording is over the 25MB limit.")
        return Sniffed(kind="audio", media_type=AUDIO_TYPES.get(suffix, declared or "audio/webm"))

    if len(data) > MAX_TEXT_BYTES:
        raise HTTPException(status_code=422, detail="That text file is over the 200KB limit.")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=415,
            detail="That file is not something we can read: send a picture, a PDF, "
            "a recording, or plain text.",
        ) from None
    if not text.strip():
        raise HTTPException(status_code=422, detail="The file has no text in it.")
    return Sniffed(kind="text", text=text)


async def _existing(session, user_id: str) -> list[Concept]:
    rows = await session.scalars(
        select(Concept)
        .where(Concept.user_id == user_id)
        .options(selectinload(Concept.mistakes), selectinload(Concept.images))
        .order_by(Concept.title)
    )
    return list(rows)


def _attach(concept: Concept, data: bytes) -> None:
    """A copy of the picture on each concept it produced, under a generated name."""
    try:
        stored = store(data, get_settings().upload_root)
    except ImageRejected:
        return  # Sniffed as an image already; a re-encoded HEIC is still a JPEG.
    concept.images.append(
        ConceptImage(
            id=new_id(),
            created_at=utcnow(),
            concept_id=concept.id,
            filename=stored.filename,
            content_type=stored.content_type,
            byte_size=stored.size,
            width=stored.width,
            height=stored.height,
            position=len(concept.images),
        )
    )


def _link_parents(
    approved: list[ApprovedConcept], by_title: dict[str, Concept]
) -> None:
    """Point each concept at the broader one it named, once every row exists.

    Set as a column, not through the `parent` relationship: assigning the
    relationship loads the other side, and these rows are not committed yet.

    Two links are refused rather than stored, because each makes a map that cannot
    be drawn or walked: a parent that is not among the concepts we have, and one
    that closes a cycle. The cycle is the dangerous one - writing it would raise
    nothing, and every later walk up the tree would spin.

    The `parent.id == child.id` test below is a fast path, not a third guard:
    removing it changes no outcome, because a concept named as its own parent is
    a cycle of length one and the walk catches it on its first hop. It is kept
    because reading "a concept is not its own parent" beats inferring it.
    """
    by_id = {concept.id: concept for concept in by_title.values()}

    for found in approved:
        wanted = (found.parent_title or "").strip().casefold()
        if not wanted:
            continue
        child = by_title.get(" ".join(found.title.split())[:200].casefold())
        parent = by_title.get(wanted)
        if child is None or parent is None or parent.id == child.id:
            continue

        # Walk up from the proposed parent: reaching the child means this link
        # would close a loop. The hop limit guards a cycle that predates this
        # capture, which the walk would otherwise never leave.
        ancestor: Concept | None = parent
        closes_a_loop = False
        for _ in range(50):
            if ancestor is None:
                break
            if ancestor.id == child.id:
                closes_a_loop = True
                break
            ancestor = by_id.get(ancestor.parent_id) if ancestor.parent_id else None

        if not closes_a_loop:
            child.parent_id = parent.id


async def _file(
    session,
    user_id: str,
    approved: list[ApprovedConcept],
    existing: list[Concept],
    image: bytes | None,
    folder: Folder | None = None,
    material: Material | None = None,
) -> list[ConceptChange]:
    by_id = {concept.id: concept for concept in existing}
    by_title = {concept.title.casefold(): concept for concept in existing}
    changes: list[ConceptChange] = []
    stamp = utcnow().date().isoformat()

    for found in approved:
        title = " ".join(found.title.split())[:200]
        if not title:
            continue
        subject = " ".join((found.subject or "").split())[:80] or None
        # The student's choice wins: an existing_id merges, none files a new one -
        # unless the title is already taken, which would be a duplicate by accident.
        target = by_id.get(found.existing_id or "") or by_title.get(title.casefold())

        if target is not None:
            addition = f"\n\n— Added from your notes, {stamp}:\n{found.body.strip()}"
            target.body = (target.body or "").rstrip() + addition
            # An existing concept keeps where it already lives: adding a video's
            # notes to a concept is not a reason to move it out of its folder.
            if target.folder_id is None and folder is not None:
                file_into(target, folder)
            elif target.subject is None and subject:
                target.subject = subject
            # Same rule as the folder: an existing concept keeps the place it has
            # in its own material. A later video mentioning it in passing must not
            # renumber a sequence built from the notes it actually came from. It
            # takes one only if it never had one.
            if target.sequence is None and found.order:
                target.sequence = found.order
            if target.when_label is None and found.when:
                target.when_label = " ".join(found.when.split())[:60] or None
            target.updated_at = utcnow()
            action = "updated"
        else:
            # id and created_at set here, not by the INSERT default: `_read` serialises
            # the row before the commit, and a None id fails validation.
            target = Concept(
                id=new_id(),
                user_id=user_id,
                created_at=utcnow(),
                title=title,
                body=found.body.strip(),
                subject=subject,
                sequence=found.order or None,
                when_label=" ".join((found.when or "").split())[:60] or None,
            )
            target.mistakes = []
            target.images = []
            # Initialised, not left to lazy-load: a new row whose collection is
            # first touched at response time raises MissingGreenlet there rather
            # than here.
            target.children = []
            if folder is not None:
                file_into(target, folder)
            else:
                await ensure_subject(session, user_id, target.subject)
            session.add(target)
            by_title[title.casefold()] = target
            action = "created"

        if image is not None:
            _attach(target, image)
        # Both halves of the branch link, created and merged alike: a concept a
        # second video added to genuinely came out of both, and a folder that
        # listed it under only the first would be lying about where to look.
        if material is not None and target not in material.concepts:
            material.concepts.append(target)
        changes.append(ConceptChange(concept=_read(target), action=action))

    # After the loop, never inside it: a concept may name a parent that appears
    # later in the list, and a title only resolves once that row has been made.
    _link_parents(approved, by_title)

    await session.commit()
    # Re-read after commit so ids, timestamps and image urls are the stored ones.
    for change in changes:
        concept = await session.scalar(
            select(Concept)
            .where(Concept.id == change.concept.id)
            .options(selectinload(Concept.mistakes), selectinload(Concept.images))
        )
        if concept is not None:
            change.concept = _read(concept)
    return changes


async def _log_questions(
    session,
    user_id: str,
    approved: list[ApprovedQuestion],
    source: str | None,
    folder: Folder | None = None,
    material: Material | None = None,
) -> list[Mistake]:
    """File practice questions, tagged under the concepts they exercise."""
    if not approved:
        return []
    concepts = {
        c.title.casefold(): c
        for c in await session.scalars(
            select(Concept)
            .where(Concept.user_id == user_id)
            .options(selectinload(Concept.mistakes), selectinload(Concept.images))
        )
    }
    logged_at = utcnow()
    created: list[Mistake] = []
    for found in approved:
        tagged = [concepts[t.casefold()] for t in found.concept_titles if t.casefold() in concepts]
        subject = next((c.subject for c in tagged if c.subject), None)
        mistake = Mistake(
            id=new_id(),
            user_id=user_id,
            created_at=logged_at,
            source=source,
            subject=subject,
            material_id=material.id if material is not None else None,
            question_text=found.question_text.strip(),
            choices=[c for c in (found.choices or []) if c.strip()] or None,
            correct_answer=found.correct_answer.strip(),
            student_note="Practice question pulled from your material.",
            tags=["practice", "written for you"] if found.origin == "generated" else ["practice"],
        )
        blank_collections(mistake)
        if folder is not None:
            file_into(mistake, folder)
        mistake.concepts = tagged
        session.add(mistake)
        created.append(mistake)
    await session.commit()
    ids = [m.id for m in created]
    rows = await session.scalars(
        select(Mistake).where(Mistake.id.in_(ids)).options(*mistake_options())
    )
    by_id = {m.id: m for m in rows}
    return [by_id[i] for i in ids if i in by_id]


def _propose_questions(extraction: CaptureExtraction) -> list[ProposedQuestion]:
    titles = {c.title.casefold(): " ".join(c.title.split())[:200] for c in extraction.concepts}
    return [
        ProposedQuestion(
            question_text=q.question_text.strip(),
            choices=q.choices,
            correct_answer=q.correct_answer.strip(),
            concept_title=titles.get(q.concept_title.casefold(), q.concept_title),
            where=q.where,
            origin=q.origin,
        )
        for q in extraction.questions
        if q.question_text.strip()
    ]


def _propose(extraction: CaptureExtraction, existing: list[Concept]) -> list[ProposedConcept]:
    by_title = {concept.title.casefold(): concept for concept in existing}
    # A parent is only meaningful if it is one of the concepts in this same
    # proposal. The model is asked for exact titles; tidy them the same way the
    # titles themselves are tidied so the two still match afterwards.
    parents = {
        c.title.casefold(): " ".join(c.title.split())[:200] for c in extraction.concepts
    }
    proposals: list[ProposedConcept] = []
    for found in extraction.concepts:
        match = by_title.get((found.existing_title or "").casefold())
        proposals.append(
            ProposedConcept(
                title=" ".join(found.title.split())[:200],
                body=found.body.strip(),
                subject=" ".join((found.subject or "").split())[:80] or None,
                parent_title=parents.get((found.parent_title or "").casefold()),
                order=found.order,
                when=" ".join((found.when or "").split())[:60] or None,
                where=found.where,
                existing_id=match.id if match else None,
                existing_title=match.title if match else None,
            )
        )
    return proposals


@router.post("", response_model=CaptureProposal)
async def capture(
    session: SessionDep,
    user_id: UserDep,
    file: Annotated[UploadFile | None, File()] = None,
    text: Annotated[str | None, Form()] = None,
    subject: Annotated[str | None, Form()] = None,
    url: Annotated[str | None, Form()] = None,
    folder_id: Annotated[str | None, Form()] = None,
    instructions: Annotated[str | None, Form()] = None,
) -> CaptureProposal:
    """Scan notes (picture, PDF, text, or a recording) and propose concepts.

    Send either `file` or `text`. `subject` is an optional steer ("Chemistry"), and
    `folder_id` is the topic folder this is being filed into - a stronger steer,
    because its subject is a course the student has actually set up. Nothing is
    written here; the same folder id goes to `/capture/commit`, which files it.

    `instructions` is the student's own brief for how to read any material -
    "keep concepts broad", "write the bodies in plain language", "skip anything
    that is not examinable". It is read before the material is turned into
    concepts and outranks the default house style, which is the point of it:
    the same PDF should be able to come back as six broad ideas or as thirty
    fine ones depending on who is revising from it.
    """
    if file is None and not (text or "").strip() and not (url or "").strip():
        raise HTTPException(status_code=422, detail="Send a file, some text, or a YouTube link.")

    video_title: str | None = None
    if (url or "").strip():
        try:
            video = await fetch_transcript(url or "")
        except VideoUnavailable as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except TranscriptionUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        video_title = video.title
        data = video.text.encode("utf-8")
        sniffed = Sniffed(kind="video", text=f"Video: {video.title}\n\n{video.text}")
    elif file is not None:
        data = await file.read(max(MAX_PDF_BYTES, MAX_AUDIO_BYTES) + 1)
        sniffed = _sniff(data, file.filename, file.content_type)
    else:
        data = (text or "").encode("utf-8")
        sniffed = Sniffed(kind="text", text=text)

    transcript: str | None = sniffed.text if sniffed.kind == "video" else None
    if sniffed.kind == "audio":
        try:
            transcript = await get_transcriber().transcribe(data, sniffed.media_type or "")
        except TranscriptionUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except TranscriptionFailed as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not transcript:
            raise HTTPException(status_code=422, detail="Nothing was said in that recording.")

    try:
        folder = await resolve_folder(session, user_id, folder_id)
    except UnknownFolder as exc:
        raise HTTPException(status_code=404, detail="No such folder") from exc
    # The folder's own subject beats a typed one: it is a course that exists.
    hint = folder.subject.name if folder is not None else " ".join((subject or "").split())[:80]

    existing = await _existing(session, user_id)
    capture_input = CaptureInput(
        kind=sniffed.kind,
        text=transcript if sniffed.kind in ("audio", "video") else sniffed.text,
        media_type=sniffed.media_type,
        data=data if sniffed.kind in ("image", "pdf") else None,
        subject_hint=hint or None,
        # Capped rather than refused: a brief this long is a pasted essay, and
        # truncating it still reads and files, where a 422 loses the upload.
        instructions=(instructions or "").strip()[:2000] or None,
        existing=[ExistingConcept(id=c.id, title=c.title, subject=c.subject) for c in existing],
    )

    extractor = get_extractor()
    try:
        extraction = await extractor.extract(capture_input)
    except AnalysisFailed as exc:
        raise HTTPException(status_code=502, detail=f"Could not read the notes: {exc}") from exc

    image_filename: str | None = None
    if sniffed.kind == "image":
        # Kept now so the commit can attach it without a second upload. A proposal
        # that is discarded leaves the file behind; `discard` below removes it.
        try:
            image_filename = store(data, get_settings().upload_root).filename
        except ImageRejected:
            image_filename = None

    return CaptureProposal(
        kind=sniffed.kind,
        title=video_title,
        extractor=extractor.name,
        transcript=transcript,
        summary=extraction.summary,
        concepts=_propose(extraction, existing),
        questions=_propose_questions(extraction),
        image_filename=image_filename,
    )


@router.post("/commit", response_model=CaptureResult)
async def commit(body: CaptureCommit, session: SessionDep, user_id: UserDep) -> CaptureResult:
    """File the concepts the student approved, as edited."""
    if not body.concepts and not body.questions:
        raise HTTPException(status_code=422, detail="Nothing to file.")

    image: bytes | None = None
    if body.image_filename:
        # Only a name this server generated resolves to a file in the upload root.
        path = upload_dir(get_settings().upload_root) / Path(body.image_filename).name
        if path.exists():
            image = path.read_bytes()
            path.unlink(missing_ok=True)

    try:
        folder = await resolve_folder(session, user_id, body.folder_id)
    except UnknownFolder as exc:
        raise HTTPException(status_code=404, detail="No such folder") from exc

    # The material row first, so the concepts and questions it produces can point
    # at it in the same transaction. Created even when the capture is only
    # concepts: "what did I put in here" is the question a folder has to answer,
    # and a capture that filed no question is still something you put in.
    material = Material(
        id=new_id(),
        user_id=user_id,
        created_at=utcnow(),
        title=_material_title(body),
        kind=" ".join(body.kind.split())[:16] or "text",
        # The subject only when there is no folder; `file_into` below sets it from
        # the folder otherwise, and the folder's own subject always wins. Without
        # this a capture filed with no folder had no subject at all, so the
        # material never appeared under the course the student had just typed.
        subject=_material_subject(body),
        source=body.source,
        summary=(body.summary or "").strip() or None,
    )
    material.concepts = []
    material.questions = []
    if folder is not None:
        file_into(material, folder)
    else:
        await ensure_subject(session, user_id, material.subject)
    session.add(material)
    await session.flush()

    existing = await _existing(session, user_id)
    changes = await _file(
        session, user_id, body.concepts, existing, image=image, folder=folder, material=material
    )
    questions = await _log_questions(
        session, user_id, body.questions, body.source, folder=folder, material=material
    )
    return CaptureResult(changes=changes, questions=questions, material_id=material.id)


def _material_subject(body: CaptureCommit) -> str | None:
    """The course this material belongs to, when no folder decides it.

    The typed steer first, because the student typed it; failing that, whatever
    the reading gave the concepts, which is the same answer they will see on the
    concepts themselves.
    """
    typed = " ".join((body.subject or "").split())[:80]
    if typed:
        return typed
    return next(
        (" ".join(c.subject.split())[:80] for c in body.concepts if (c.subject or "").strip()),
        None,
    )


def _material_title(body: CaptureCommit) -> str:
    """What to call this capture in the folder listing.

    Never blank and never bare: a folder showing "(untitled)" four times is a
    folder you cannot navigate, so a capture with no title of its own is named
    for what it was and when it arrived.
    """
    given = " ".join((body.title or "").split())[:200]
    if given:
        return given
    kind = KIND_LABELS.get(body.kind, body.kind or "notes")
    return f"Your {kind}, {utcnow().date().isoformat()}"


KIND_LABELS = {
    "image": "picture",
    "pdf": "PDF",
    "text": "notes",
    "audio": "recording",
    "video": "video",
}


@router.delete("/source/{filename}", status_code=204)
async def discard(filename: str) -> None:
    """Throw away the stored picture of a proposal the student did not approve."""
    delete_file(Path(filename).name, get_settings().upload_root)
