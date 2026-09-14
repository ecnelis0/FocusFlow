"""Read a picture of one question and fill the log form from it.

Distinct from `extract.py`, which reads a page of notes and files everything it
finds. This reads a single question - a Question Bank screenshot, a photo of a
worksheet, a page of a practice test - and returns the fields the student would
otherwise retype. Nothing is written: the student sees the form filled in, fixes
whatever the model misread, and logs it themselves.

What the picture never contains is the answer they actually put. That box stays
empty on purpose; it is the one thing only the student knows, and it is what the
whole debrief is built on.
"""

from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..config import get_settings

ScanKind = Literal["image", "pdf"]


class ScanInput(BaseModel):
    """What a scanner is handed. The bytes are already sniffed and size-checked."""

    kind: ScanKind
    media_type: str
    data: bytes
    # Optional steer from the student: "this is chemistry".
    subject_hint: str | None = None


class ScannedQuestion(BaseModel):
    """What a scanner must return. Doubles as the model's output schema.

    Every field is optional except the question itself, because a picture that
    shows only the question is still worth reading - a half-filled form beats a
    blank one, and the student finishes it.
    """

    model_config = ConfigDict(extra="forbid")

    question_text: str = Field(
        description="The question exactly as it appears, self-contained. Include the "
        "passage, table, or setup it depends on, so it can be answered later without "
        "the picture. Transcribe maths as it reads: 'y = sin(3x^2)'. Do not solve it, "
        "do not summarise it, and do not add anything that is not in the picture."
    )
    choices: list[str] | None = Field(
        default=None,
        description="The answer options in order, each keeping its own label: "
        "'A. The choice of a New York City venue...'. Null when the question is not "
        "multiple choice.",
    )
    correct_answer: str | None = Field(
        default=None,
        description="The correct answer if the picture states it - an answer key, a "
        "'Correct Answer: C' line, a worked rationale. Give the label alone when the "
        "choices are labelled, e.g. 'C'; otherwise the value, e.g. '12'. Null when the "
        "picture does not say. Never guess, and never work it out yourself.",
    )
    subject: str | None = Field(
        default=None,
        description="The school subject, e.g. 'Biology' or 'Calculus'. For a "
        "standardised test, the section: 'SAT Reading and Writing', 'SAT Math'. Null "
        "if the picture gives no clue.",
    )
    source: str | None = Field(
        default=None,
        description="Where this came from, if the picture says: 'SAT Question Bank, "
        "ID ed314256', 'Practice Test 4, Q17', 'Chapter 3 review, p.88'. Null "
        "otherwise. Under 200 characters.",
    )
    note: str | None = Field(
        default=None,
        description="Only when something about the picture the student should check - "
        "'the second half of the passage is cut off', 'the diagram did not scan'. Null "
        "when the read was clean. This is about the picture, not about the question.",
    )


SCAN_PROMPT = """You read a picture of a single practice question and return its \
fields so a student does not have to retype them.

Transcribe, do not interpret. The question text must match the picture word for \
word, including any passage it refers to. Keep the answer choices in their original \
order with their original labels.

Only report a correct answer the picture actually states. These pictures often come \
from a question bank that prints the answer and a rationale below the question - use \
that. If there is no answer key visible, return null. A guess here is worse than a \
blank: the student would file the wrong answer as the right one and revise from it \
for a month.

If the picture holds more than one question, take the one that is the subject of the \
page - the one with the rationale or the answer under it - and say so in `note`.

If the picture is not a question at all, say so in `note` and put whatever text you \
can read in `question_text`."""


class Scanner(Protocol):
    name: str

    async def read(self, scan: ScanInput) -> ScannedQuestion: ...


# --- offline ------------------------------------------------------------------


class StubScanner:
    """Cannot read pictures. Returns an empty form and says why.

    Keeps the endpoint honest with no key set: the student gets a clear message
    rather than a silent no-op or invented fields.
    """

    name = "stub"

    async def read(self, scan: ScanInput) -> ScannedQuestion:
        return ScannedQuestion(
            question_text="",
            subject=scan.subject_hint,
            note="The offline reader cannot see pictures. Set AI_PROVIDER=agent or "
            "claude to have this one read, or type the question in yourself.",
        )


def get_scanner() -> Scanner:
    """Mirrors `get_analyzer`: the provider decides, and stub always works."""
    provider = get_settings().ai_provider.lower()

    if provider == "claude":
        from .claude import ClaudeScanner

        settings = get_settings()
        return ClaudeScanner(settings.anthropic_api_key, settings.anthropic_model)

    if provider == "agent":
        from .agent import AgentScanner

        return AgentScanner(get_settings().anthropic_model)

    return StubScanner()
