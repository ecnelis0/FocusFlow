"""Database model: a mistake, and the fixed review ladder attached to it."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, selectinload


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return uuid.uuid4().hex


class UtcDateTime(TypeDecorator):
    """A timestamp that is UTC-aware on both sides of the database.

    SQLite has no timezone storage, so a plain ``DateTime(timezone=True)`` column
    silently reads back naive - which blows up the moment it meets a freshly
    constructed aware datetime, and serialises to JSON with no offset for the
    frontend to trust. This normalises on the way in and re-attaches UTC on the
    way out, so SQLite and Postgres behave the same.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Refusing to store a naive datetime; pass an aware one")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


class Subject(Base):
    """A course the student is taking: "APUSH", "SAT", "Calculus".

    Subjects are rows rather than distinct strings because an empty one has to
    exist: you set up your courses before the first question is logged, and a tab
    for a subject with nothing in it yet is the whole point of setting it up.

    `Mistake.subject` and `Concept.subject` still hold the *name*, because the
    filters, the stats and every analyzer prompt speak in subject names. The rule
    that keeps them from drifting lives in `filing.py`: **the folder is
    authoritative and `subject` is its denormalised name**, and nothing outside
    that module writes either field on its own.
    """

    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_subjects_user_name"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    name: Mapped[str] = mapped_column(String(80))
    # The student's own tab order. Ties break on name, so a fresh bank is alphabetical.
    position: Mapped[int] = mapped_column(Integer, default=0)

    folders: Mapped[list[Folder]] = relationship(
        back_populates="subject",
        cascade="all, delete-orphan",
        order_by="Folder.position, Folder.name",
    )


class Folder(Base):
    """A topic inside a subject: "Unit 3: Revolution", "Related rates".

    Holds both halves of the bank - the concepts filed under the topic and the
    questions logged against it - so opening a folder shows the whole of what you
    know and what you have got wrong about that topic in one place.
    """

    __tablename__ = "folders"
    __table_args__ = (UniqueConstraint("subject_id", "name", name="uq_folders_subject_name"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    subject_id: Mapped[str] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    name: Mapped[str] = mapped_column(String(80))
    position: Mapped[int] = mapped_column(Integer, default=0)

    subject: Mapped[Subject] = relationship(back_populates="folders")


# A concept is the thing behind a whole family of misses, so the link is many-to-many:
# one question can sit under several concepts, and a concept collects many questions.
concept_mistakes = Table(
    "concept_mistakes",
    Base.metadata,
    Column("concept_id", ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True),
    Column("mistake_id", ForeignKey("mistakes.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-many, because a second video about the same topic adds its notes to a
# concept that already exists rather than filing a duplicate - and after that the
# concept genuinely came from two materials. A question has one material, so that
# side is a plain column on `Mistake`.
material_concepts = Table(
    "material_concepts",
    Base.metadata,
    Column("material_id", ForeignKey("materials.id", ondelete="CASCADE"), primary_key=True),
    Column("concept_id", ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True),
)


class Concept(Base):
    """Something worth knowing, written by the student, that questions hang off."""

    __tablename__ = "concepts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(UtcDateTime())

    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    # Free text ("Biology", "Calculus", "Spanish"). Optional: plenty of concepts
    # (careless-work habits, pacing) belong to no subject in particular.
    subject: Mapped[str | None] = mapped_column(String(80), index=True)
    # The topic folder this is filed in, inside that subject. Null means the concept
    # sits loose in the subject (or in no subject at all) - never an error, just
    # unfiled. Set only through `filing.py`, which keeps `subject` in step with it.
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), index=True
    )

    # The broader concept this sits under - "Battle of Yorktown" beneath "The
    # American Revolution". Null means this is one of the big organising ideas, the
    # kind a mind map puts in the middle. Self-referential, so the concepts in a
    # folder form a tree rather than a flat list of forty things.
    #
    # `ondelete` is documentation on SQLite (no connection sets `foreign_keys=ON`),
    # so deleting a parent must orphan its children in Python - see
    # `routers/concepts.py`. Left to the database, a deleted parent would leave
    # children pointing at a row that is gone.
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="SET NULL"), index=True
    )
    parent: Mapped[Concept | None] = relationship(
        back_populates="children", remote_side=[id]
    )
    # Where this sits in the order the material runs: chronological for history,
    # procedural for a method, foundations-first otherwise. Numbered among siblings
    # - branches against branches, details against the details of their own branch -
    # so it is a position, not a global rank. Null means the reading gave no order,
    # and every list falls back to the title so the page is still deterministic.
    sequence: Mapped[int | None] = mapped_column(Integer)
    # What that position is called, shown to the student: "1763", "1775-1783",
    # "Step 2". Free text because a period, a date and a step are all answers, and
    # only the student's material knows which. Null when nothing sensible fits, and
    # a timeline needs `sequence` regardless - this is the caption, not the key.
    when_label: Mapped[str | None] = mapped_column(String(60))

    # Where the student dragged this on the map, in the map's own coordinates.
    # Null means "wherever the layout puts it", which is every concept until one
    # is moved by hand - so the computed shape stays the default and a nudge is
    # remembered rather than reapplied every time the page is drawn.
    map_x: Mapped[float | None] = mapped_column(Float)
    map_y: Mapped[float | None] = mapped_column(Float)

    children: Mapped[list[Concept]] = relationship(
        back_populates="parent",
        # Nulls last: an unordered concept is not concept zero. SQLite has no
        # NULLS LAST, so order on the `IS NULL` flag first, which it does have.
        order_by="Concept.sequence.is_(None), Concept.sequence, Concept.title",
    )

    mistakes: Mapped[list[Mistake]] = relationship(
        secondary=concept_mistakes,
        back_populates="concepts",
        order_by="Mistake.created_at.desc()",
    )
    images: Mapped[list[ConceptImage]] = relationship(
        back_populates="concept",
        cascade="all, delete-orphan",
        order_by="ConceptImage.position, ConceptImage.created_at",
    )
    materials: Mapped[list[Material]] = relationship(
        secondary=material_concepts,
        back_populates="concepts",
        order_by="Material.created_at",
    )


class Material(Base):
    """One thing the student put in: a PDF, a video, a recording, a page of notes.

    The record of a capture, kept so a folder can be read as "what I have put in
    here" rather than as one pooled heap of concepts. Without it the app knows a
    concept exists and where it is filed, but not which upload produced it, which
    is the question you ask when you come back to a unit a month later.

    Holds no bytes. A picture is already stored against the concepts it produced;
    this is the receipt, not the file.
    """

    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    # Filed exactly like a question or a concept, and by the same module: the
    # folder is authoritative and `subject` is its name. See `filing.py`.
    subject: Mapped[str | None] = mapped_column(String(80), index=True)
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), index=True
    )

    # What it was called - a video's title, a file's name, or a line of the text
    # when it had neither. Never blank: a folder listing "(untitled)" four times
    # is a folder you cannot navigate.
    title: Mapped[str] = mapped_column(String(200))
    # "pdf", "image", "text", "audio" or "video". Free text rather than an enum
    # because the capture endpoint sniffs it from the bytes and a new kind should
    # not need a migration to be recorded.
    kind: Mapped[str] = mapped_column(String(16))
    # The URL or filename it arrived as, when there was one.
    source: Mapped[str | None] = mapped_column(String(400))
    # The extractor's own summary of the whole thing, shown under the title.
    summary: Mapped[str | None] = mapped_column(Text)

    # A written-up page of notes, as `NoteDocument` JSON. Null until asked for:
    # writing them is a second AI call, and most material never gets read twice.
    # Stored rather than regenerated because the same material must not produce
    # different notes each time it is opened - a revision page that rewrites
    # itself is one you cannot come back to.
    notes: Mapped[dict | None] = mapped_column(JSON)
    notes_written_at: Mapped[datetime | None] = mapped_column(UtcDateTime())

    concepts: Mapped[list[Concept]] = relationship(
        secondary=material_concepts,
        back_populates="materials",
        order_by="Concept.sequence.is_(None), Concept.sequence, Concept.title",
    )
    questions: Mapped[list[Mistake]] = relationship(
        back_populates="material",
        order_by="Mistake.created_at",
    )


class Mistake(Base):
    """One practice question, as pulled out of a piece of study material.

    Named `Mistake` and `mistakes` still, because renaming a table is a migration
    with nothing to show for it. What it holds is a question, its answer, the
    concepts it exercises and where it is filed.
    """

    __tablename__ = "mistakes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    # Where it came from - the video title, the file name.
    source: Mapped[str | None] = mapped_column(String(200))
    # Free text, whatever the student calls the area ("Biology", "Calculus"). Not a
    # closed vocabulary: the bank is for any subject, so the app cannot know them.
    subject: Mapped[str | None] = mapped_column(String(80), index=True)
    # See `Concept.folder_id`. Same rule, same owner.
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), index=True
    )
    question_text: Mapped[str] = mapped_column(Text)
    choices: Mapped[list | None] = mapped_column(JSON)
    correct_answer: Mapped[str] = mapped_column(Text)
    student_note: Mapped[str | None] = mapped_column(Text)

    topic: Mapped[str | None] = mapped_column(String(120), index=True)
    tags: Mapped[list | None] = mapped_column(JSON)

    # The upload this came out of. Null for a question that predates materials, so
    # the bank can still show it rather than hiding what it cannot attribute.
    material_id: Mapped[str | None] = mapped_column(
        ForeignKey("materials.id", ondelete="SET NULL"), index=True
    )
    material: Mapped[Material | None] = relationship(back_populates="questions")

    images: Mapped[list[MistakeImage]] = relationship(
        back_populates="mistake",
        cascade="all, delete-orphan",
        order_by="MistakeImage.position, MistakeImage.created_at",
    )
    concepts: Mapped[list[Concept]] = relationship(
        secondary=concept_mistakes,
        back_populates="mistakes",
        order_by="Concept.title",
    )


class ConceptImage(Base):
    """A diagram or photo illustrating a concept.

    Same rules as `MistakeImage`: the filename is generated, the type comes from
    decoding the bytes. Two tables rather than one polymorphic one - a foreign key
    that means different things depending on a discriminator column is how orphaned
    rows and cascade mistakes get in.
    """

    __tablename__ = "concept_images"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    concept_id: Mapped[str] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    filename: Mapped[str] = mapped_column(String(80))
    content_type: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    caption: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer, default=0)

    concept: Mapped[Concept] = relationship(back_populates="images")

    @property
    def url(self) -> str:
        return f"/uploads/{self.filename}"


class MistakeImage(Base):
    """A picture of the question, filed against it.

    Only the stored filename lives in the database; the bytes are on disk. The
    filename is generated, never taken from the upload - an attacker-controlled
    name is how you end up writing outside the upload directory.
    """

    __tablename__ = "mistake_images"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    mistake_id: Mapped[str] = mapped_column(
        ForeignKey("mistakes.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    filename: Mapped[str] = mapped_column(String(80))
    content_type: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    caption: Mapped[str | None] = mapped_column(String(200))
    # The student's own order, so a question and its answer key stay in sequence.
    position: Mapped[int] = mapped_column(Integer, default=0)

    mistake: Mapped[Mistake] = relationship(back_populates="images")

    @property
    def url(self) -> str:
        """Where the browser fetches it. Serialised straight into `ImageRead`."""
        return f"/uploads/{self.filename}"


def blank_collections(mistake: Mistake) -> Mistake:
    """Initialise the collections a brand-new question serialises but never loads.

    A pending question has no concepts and no images. Saying so explicitly stops the
    response from trying to lazy-load them after the commit, which fails as a
    MissingGreenlet rather than as a missing field. Kept next to `mistake_options`
    because the two lists must be added to together.
    """
    mistake.concepts = []
    mistake.images = []
    return mistake


def concept_options() -> tuple:
    """Everything a concept serialises, eager-loaded. See `mistake_options`."""
    return (selectinload(Concept.mistakes), selectinload(Concept.images))


def mistake_options() -> tuple:
    """Everything `MistakeRead` serialises, eager-loaded.

    One place, because a missing relationship here is not a missing field - it is a
    MissingGreenlet at response time, on whichever endpoint was forgotten.
    """
    return (
        selectinload(Mistake.concepts),
        selectinload(Mistake.images),
    )
