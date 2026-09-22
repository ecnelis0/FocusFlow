"""Request and response bodies."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def tidy_subject(value: str | None) -> str | None:
    """Trim a free-text subject; a blank one means "no subject", not an empty string.

    "  Biology " and "Biology" being two subjects would split every count and every
    filter in half, and an empty string would show up as a nameless group.
    """
    if value is None:
        return None
    tidy = " ".join(value.split())
    return tidy or None


def tidy_name(value: str) -> str:
    """A subject or folder name, trimmed. Blank is a validation error, not a None.

    Different from `tidy_subject`: a subject's *name* is the thing itself, so an
    empty one cannot mean "no subject" the way a blank field on a question does.
    """
    tidy = " ".join(value.split())
    if not tidy:
        raise ValueError("must not be blank")
    return tidy


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _tidy(cls, value: str) -> str:
        return tidy_name(value)


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    # Moving a folder to another subject carries everything in it, which is why
    # `subject` is not separately settable on the rows themselves.
    subject_id: str | None = None
    position: int | None = None

    @field_validator("name")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return None if value is None else tidy_name(value)


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_id: str
    name: str
    position: int
    created_at: datetime
    # What is inside, so a folder card can say so without a request per folder.
    concept_count: int = 0
    question_count: int = 0


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _tidy(cls, value: str) -> str:
        return tidy_name(value)


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    position: int | None = None

    @field_validator("name")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return None if value is None else tidy_name(value)


class SubjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    position: int
    created_at: datetime
    folders: list[FolderRead] = []
    # Everything under the subject, folders and loose rows alike. The tab's count.
    concept_count: int = 0
    question_count: int = 0
    # How much of it is in no folder yet - what the "Unfiled" card shows.
    unfiled_concept_count: int = 0
    unfiled_question_count: int = 0


class MistakeUpdate(BaseModel):
    """Every field on a question is editable.

    All optional: only the keys actually sent are changed, so a form can save one
    field without having to round-trip the rest.
    """

    subject: str | None = Field(default=None, max_length=80)
    # Send null to take it out of its folder; the subject is kept either way.
    folder_id: str | None = None
    source: str | None = Field(default=None, max_length=200)
    question_text: str | None = None
    choices: list[str] | None = None
    correct_answer: str | None = None
    student_note: str | None = None
    topic: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = None

    @field_validator("tags")
    @classmethod
    def _tidy_tags(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        seen: dict[str, str] = {}
        for value in values:
            tidy = " ".join(value.split())
            if tidy and tidy.casefold() not in seen:
                seen[tidy.casefold()] = tidy
        return list(seen.values())

    @field_validator("subject")
    @classmethod
    def _tidy_subject(cls, value: str | None) -> str | None:
        return tidy_subject(value)

    @field_validator("question_text", "correct_answer")
    @classmethod
    def _not_blanked(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class ConceptSummary(BaseModel):
    """What a question shows about the concepts it is filed under."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str


class ConceptCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str | None = None
    # Ignored when `folder_id` is given: the folder decides the subject.
    subject: str | None = Field(default=None, max_length=80)
    folder_id: str | None = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("subject")
    @classmethod
    def _tidy_subject(cls, value: str | None) -> str | None:
        return tidy_subject(value)


class ConceptUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = None
    subject: str | None = Field(default=None, max_length=80)
    folder_id: str | None = None
    # Where the student dragged it on the map. Sent as a pair, because half a
    # position is not a position - the map would read the missing one as 0 and
    # slam the card against the origin.
    map_x: float | None = None
    map_y: float | None = None

    @field_validator("title")
    @classmethod
    def _not_blanked(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("subject")
    @classmethod
    def _tidy_subject(cls, value: str | None) -> str | None:
        return tidy_subject(value)


class ConceptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime | None
    title: str
    body: str | None
    subject: str | None
    folder_id: str | None = None
    # The broader concept this hangs under, null for a top-level one. The tree is
    # sent as parent pointers rather than nested children: a concept is serialised
    # in several places and a recursive shape would have to be cut off somewhere.
    parent_id: str | None = None
    # Position among siblings in the order the material runs, and what that
    # position is called. Null sequence means the reading gave no order; every
    # list falls back to the title so it is still deterministic.
    sequence: int | None = None
    when_label: str | None = None
    # Null until the student drags it; the map computes a place for it until then.
    map_x: float | None = None
    map_y: float | None = None
    question_count: int = 0
    images: list[ImageRead] = []


class ConceptDetail(ConceptRead):
    mistakes: list[MistakeRead] = []


class ImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    content_type: str
    byte_size: int
    width: int | None
    height: int | None
    caption: str | None
    position: int


class MistakeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    subject: str | None
    folder_id: str | None = None
    source: str | None
    question_text: str
    choices: list[str] | None
    correct_answer: str
    student_note: str | None
    topic: str | None
    tags: list[str] | None
    # The upload this came out of, null for a question that predates materials.
    # Without it on the wire, a folder cannot tell a question that belongs to a
    # material it is already listing from one moved in on its own, and lists
    # every question twice over.
    material_id: str | None = None

    concepts: list[ConceptSummary] = []
    images: list[ImageRead] = []


class MaterialRead(BaseModel):
    """One thing the student put in, as a folder lists it."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    title: str
    kind: str
    source: str | None
    summary: str | None
    subject: str | None
    folder_id: str | None
    concept_count: int = 0
    question_count: int = 0


class MaterialDetail(MaterialRead):
    """A material opened: everything that came out of that one upload."""

    concepts: list[ConceptRead] = []
    questions: list[MistakeRead] = []
