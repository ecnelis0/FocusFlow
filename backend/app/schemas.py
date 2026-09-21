"""Request and response bodies."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import Difficulty, ErrorType, ReviewOutcome, Urgency


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


class MistakeCreate(BaseModel):
    # Free text: "Biology", "Calculus", "Spanish". Optional, at most 80 characters.
    # Ignored when `folder_id` is given: the folder decides the subject.
    subject: str | None = Field(default=None, max_length=80)
    # The topic folder to file this in. Sets `subject` to the folder's own.
    folder_id: str | None = None
    # Optional: say how badly this needs revisiting while you still remember. Left
    # unset, the analyzer decides.
    urgency: Urgency | None = None
    question_text: str = Field(min_length=1)
    your_answer: str = Field(min_length=1)
    correct_answer: str = Field(min_length=1)
    choices: list[str] | None = None
    source: str | None = Field(default=None, max_length=200)
    student_note: str | None = None
    # Filed and labelled while you still remember, rather than only afterwards.
    concept_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _tidy_tags(cls, values: list[str]) -> list[str]:
        """Trim, drop blanks, and de-duplicate case-insensitively.

        "By Mistake" and "by mistake" being two different tags would quietly split
        every count and every filter in half.
        """
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

    @field_validator("question_text", "your_answer", "correct_answer")
    @classmethod
    def _strip(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


ANALYSIS_FIELDS = (
    "error_type",
    "topic",
    "difficulty",
    "urgency",
    "why_wrong",
    "correct_reasoning",
    "takeaway",
    "trap",
)
# Note: `tags` is deliberately not here. They are the student's own labels, not
# something the analyzer writes, so relabelling a question must not mark its
# analysis as edited - which would block a re-run behind a 409.


class MistakeUpdate(BaseModel):
    """Every field on a mistake is editable, including everything the AI wrote.

    All optional: only the keys actually sent are changed, so a form can save one
    field without having to round-trip the rest.
    """

    subject: str | None = Field(default=None, max_length=80)
    # Send null to take it out of its folder; the subject is kept either way.
    folder_id: str | None = None
    source: str | None = Field(default=None, max_length=200)
    question_text: str | None = None
    choices: list[str] | None = None
    your_answer: str | None = None
    correct_answer: str | None = None
    student_note: str | None = None

    error_type: ErrorType | None = None
    topic: str | None = Field(default=None, max_length=120)
    difficulty: Difficulty | None = None
    urgency: Urgency | None = None
    why_wrong: str | None = None
    correct_reasoning: str | None = None
    takeaway: str | None = None
    trap: str | None = None
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

    @field_validator("question_text", "your_answer", "correct_answer")
    @classmethod
    def _not_blanked(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    def touches_analysis(self) -> bool:
        return any(field in self.model_fields_set for field in ANALYSIS_FIELDS)


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


class ReviewEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cycle: int
    step_index: int
    interval_label: str
    due_at: datetime
    completed_at: datetime | None
    outcome: ReviewOutcome | None


class MistakeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    subject: str | None
    folder_id: str | None = None
    source: str | None
    question_text: str
    choices: list[str] | None
    your_answer: str
    correct_answer: str
    student_note: str | None

    analysis_status: str
    analysis_error: str | None
    analyzed_at: datetime | None
    analyzed_by: str | None
    analysis_edited_at: datetime | None
    error_type: ErrorType | None
    topic: str | None
    difficulty: Difficulty | None
    urgency: Urgency | None
    urgency_is_yours: bool
    why_wrong: str | None
    correct_reasoning: str | None
    takeaway: str | None
    trap: str | None
    tags: list[str] | None

    reviews: list[ReviewEventRead] = []
    concepts: list[ConceptSummary] = []
    images: list[ImageRead] = []


class DueReview(BaseModel):
    """A rung that is ready to be reviewed, with the question it belongs to."""

    review: ReviewEventRead
    mistake: MistakeRead


class ReviewComplete(BaseModel):
    outcome: ReviewOutcome

    @field_validator("outcome")
    @classmethod
    def _student_outcomes_only(cls, value: ReviewOutcome) -> ReviewOutcome:
        if value is ReviewOutcome.superseded:
            raise ValueError("'superseded' is set by the ladder, not by the student")
        return value


class ReviewCompleteResult(BaseModel):
    review: ReviewEventRead
    ladder_restarted: bool
    next_due_at: datetime | None


class ReviewAnswer(BaseModel):
    """What the student typed or picked. The server decides if it is right."""

    answer: str = Field(min_length=1)


class ReviewAnswerResult(ReviewCompleteResult):
    correct: bool
    your_answer: str
    correct_answer: str


class SlotCount(BaseModel):
    key: str
    count: int


class TopicCount(BaseModel):
    """A topic reported with the subject it was logged under.

    The subject is free text and optional, so it can be None: the topics of
    questions logged with no subject are grouped together under it.
    """

    subject: str | None
    topic: str
    count: int


class Stats(BaseModel):
    total_mistakes: int
    due_now: int
    # How many questions carry no concept at all - the number that makes the gap in
    # the bank visible instead of something you notice by scrolling.
    untagged_questions: int
    reviews_completed: int
    by_error_type: list[SlotCount]
    by_urgency: list[SlotCount]
    by_concept: list[SlotCount]
    # Only questions that carry a subject; the rest are counted in total_mistakes.
    by_subject: list[SlotCount]
    topics: list[TopicCount]


ConceptRead.model_rebuild()
ConceptDetail.model_rebuild()
