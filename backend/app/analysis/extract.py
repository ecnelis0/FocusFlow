"""Turning captured notes into concepts.

A capture is a photo of handwritten notes, a PDF, a pasted block of text, or the
transcript of a recording. The extractor reads it and returns the concepts it
contains - the rules and ideas worth remembering, not a summary of the page - so
they can be filed straight into the bank.

Same shape as the analyzer: a Protocol, an offline stub the tests run against, and
a Claude adapter that uses structured outputs so the result is a validated object.
"""

from __future__ import annotations

import base64
import re
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..config import get_settings
from .base import AnalysisFailed

CaptureKind = Literal["image", "pdf", "text", "audio", "video"]


class ExistingConcept(BaseModel):
    """A concept already in the bank, so the model can merge rather than duplicate."""

    id: str
    title: str
    subject: str | None = None


class CaptureInput(BaseModel):
    """What the extractor is handed. Bytes only for the kinds the model can read."""

    kind: CaptureKind
    # The pasted text, or the transcript of a recording. Empty for an image or a PDF.
    text: str | None = None
    media_type: str | None = None
    data: bytes | None = None
    # Optional steer from the student: "this is from my chemistry notes".
    subject_hint: str | None = None
    existing: list[ExistingConcept] = Field(default_factory=list)


class ExtractedConcept(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(
        description="The concept as a rule the student can recall, under 100 characters. "
        "'Integration by parts: pick u to be the thing that gets simpler', not 'Calculus'."
    )
    body: str = Field(
        description="The concept in two to six sentences, written for the student to "
        "revise from later: what it is, the trap it sets, and how to apply it. Keep the "
        "student's own examples and phrasing where they exist."
    )
    subject: str | None = Field(
        default=None,
        description="The subject this belongs to, e.g. 'Biology'. Copy an existing "
        "subject from the list you were given when one fits; otherwise a short name.",
    )
    existing_title: str | None = Field(
        default=None,
        description="If this is the same concept as one already in the bank, copy that "
        "concept's title exactly so the notes are added to it. Otherwise null.",
    )
    where: str | None = Field(
        default=None,
        description="Where in the material this came from - 'page 3', 'second "
        "paragraph', 'around 4:10 in the recording'. Null if there is no sensible answer.",
    )


class ExtractedQuestion(BaseModel):
    """A practice question found in the material, with the concept it exercises."""

    model_config = ConfigDict(extra="forbid")

    question_text: str = Field(
        description="The question exactly as posed, self-contained: include any numbers, "
        "expressions or passage it depends on so it can be answered on its own later."
    )
    choices: list[str] | None = Field(
        default=None,
        description="The answer options when it is multiple choice, in order. Null otherwise.",
    )
    correct_answer: str = Field(
        description="The correct answer, as given or worked in the material. If the "
        "material never answers it, work it out and say so briefly, e.g. '12 (worked)'."
    )
    concept_title: str = Field(
        description="The title of the concept in your `concepts` list that this question "
        "exercises. Copy it exactly."
    )
    where: str | None = Field(
        default=None, description="Where it appears - 'page 4', '12:30 in the video'. Or null."
    )
    origin: Literal["material", "generated"] = Field(
        default="material",
        description="'material' when the question is posed in the notes or video; "
        "'generated' when you wrote it yourself to test a concept the material never "
        "questions. Never pass off a generated question as material.",
    )


class CaptureExtraction(BaseModel):
    """What an extractor must return. Doubles as the model's output schema."""

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(
        description="One or two sentences on what these notes cover, addressed to the student."
    )
    concepts: list[ExtractedConcept] = Field(
        description="Every single distinct concept in the notes, in the order they "
        "appear, from the first page to the last. Do not stop early, do not cap the "
        "list, do not skip a page. An empty list only if the material contains nothing "
        "worth remembering."
    )
    questions: list[ExtractedQuestion] = Field(
        default_factory=list,
        description="Every practice question, worked example, exercise or quiz item in the "
        "material - all of them, not a sample - each tied to the concept it exercises "
        "(origin='material'). Then, for every concept the material never questions, one "
        "or two short practice questions you write to test it (origin='generated'), so "
        "each concept has something to be reviewed on.",
    )


class Extractor(Protocol):
    name: str

    async def extract(self, capture: CaptureInput) -> CaptureExtraction: ...


# --- offline ------------------------------------------------------------------


class StubExtractor:
    """Splits text into paragraphs and calls each one a concept.

    Cannot read pictures or PDFs; for those it files one placeholder concept so the
    whole loop is demonstrable without a key.
    """

    name = "stub"

    async def extract(self, capture: CaptureInput) -> CaptureExtraction:
        existing = {c.title.casefold(): c.title for c in capture.existing}
        subject = capture.subject_hint or None

        if not capture.text:
            title = f"Notes from your {capture.kind}"
            return CaptureExtraction(
                summary=f"Filed your {capture.kind} as one concept. (Offline extractor: set "
                "AI_PROVIDER=claude to have the notes read.)",
                concepts=[
                    ExtractedConcept(
                        title=title,
                        body="The picture is attached below. Write the rule in your own words.",
                        subject=subject,
                        existing_title=existing.get(title.casefold()),
                    )
                ],
            )

        concepts: list[ExtractedConcept] = []
        for block in re.split(r"\n\s*\n|\n(?=[-*•#])", capture.text):
            lines = [line.strip(" -*•#\t") for line in block.strip().splitlines()]
            lines = [line for line in lines if line]
            if not lines:
                continue
            title = re.split(r"(?<=[.:;!?])\s", lines[0], maxsplit=1)[0].rstrip(".:;")[:100]
            body = " ".join(lines) if len(lines) > 1 else lines[0]
            concepts.append(
                ExtractedConcept(
                    title=title,
                    body=body,
                    subject=subject,
                    existing_title=existing.get(title.casefold()),
                )
            )

        # Offline: a line that ends in a question mark is a practice question, filed
        # under the last concept seen before it. Its answer is whatever follows
        # "Answer:" on the same line, else marked unknown.
        questions: list[ExtractedQuestion] = []
        current = concepts[0].title if concepts else None
        for line in capture.text.splitlines():
            stripped = line.strip(" -*•#\t")
            if not stripped:
                continue
            for concept in concepts:
                if stripped.startswith(concept.title):
                    current = concept.title
            if "?" in stripped and current:
                text, _, answer = stripped.partition("Answer:")
                questions.append(
                    ExtractedQuestion(
                        question_text=text.strip(),
                        correct_answer=answer.strip() or "(not given)",
                        concept_title=current,
                    )
                )

        count = len(concepts)
        return CaptureExtraction(
            summary=f"Found {count} concept{'' if count == 1 else 's'} and {len(questions)} "
            "question(s) in your notes. (Offline extractor: set AI_PROVIDER=claude for a "
            "real reading.)",
            concepts=concepts,
            questions=questions,
        )


# --- Claude -------------------------------------------------------------------

EXTRACT_PROMPT = """\
You are a tutor reading a student's notes so they can be filed into their concept bank.

A concept is the thing behind a family of mistakes: a rule, a definition, a method, a \
distinction, a trap. Pull out every single distinct one the notes contain - go through \
the whole document, every page, and list each concept with its own description. Do not \
stop after the first few; do not summarise the page instead of listing what is on it; \
do not invent material that is not there; do not pad a single idea into several. Title \
each concept as something the student can recall, and write its body \
as the note they would want to re-read a month later, keeping their own examples and \
phrasing where they exist.

Handwriting may be messy and a transcript may have mis-heard words - read for the \
meaning and correct obvious errors, but say in the body when a passage was illegible.

You are given the concepts already in the bank. When the notes cover one of them, set \
existing_title to that concept's exact title so the new material is added to it \
rather than filed twice. Copy subjects from the existing list where one fits.

Also list every practice question the material poses - worked examples, exercises, quiz \
items, "try this" prompts, the questions a lecturer asks and then answers. All of them. \
Each carries its answer and the exact title of the concept (from your own list) it \
exercises, so it can be filed under that concept and come back for review. A lecture \
often poses none: then write one or two short practice questions per concept yourself, \
with answers, and mark them origin="generated" - the student sees that label, so be \
honest about it. A generated question must be answerable in one line and checkable \
against a single correct answer.\
"""


_TEXT_LABELS = {
    "audio": "Transcript of the recording",
    "video": "Transcript of the video",
    "text": "The notes",
}


def _existing_block(capture: CaptureInput) -> str:
    if not capture.existing:
        return "Concepts already in the bank: (none yet)"
    lines = [f"- {c.title}" + (f" [{c.subject}]" if c.subject else "") for c in capture.existing]
    return "Concepts already in the bank:\n" + "\n".join(lines)


def _content(capture: CaptureInput) -> list[dict]:
    """The user turn: the material first, then what to do with it."""
    blocks: list[dict] = []
    if capture.kind in ("image", "pdf"):
        if capture.data is None or capture.media_type is None:
            raise AnalysisFailed(f"a {capture.kind} capture needs bytes")
        data = base64.standard_b64encode(capture.data).decode("ascii")
        blocks.append(
            {
                "type": "image" if capture.kind == "image" else "document",
                "source": {"type": "base64", "media_type": capture.media_type, "data": data},
            }
        )
    else:
        label = _TEXT_LABELS.get(capture.kind, "The notes")
        blocks.append({"type": "text", "text": f"{label}:\n{capture.text or ''}"})

    instructions = [_existing_block(capture)]
    if capture.subject_hint:
        instructions.append(f"The student says these notes are about: {capture.subject_hint}")
    instructions.append("Extract the concepts.")
    blocks.append({"type": "text", "text": "\n\n".join(instructions)})
    return blocks


class ClaudeExtractor:
    name = "claude"

    def __init__(
        self,
        api_key: str | None,
        model: str,
        http_client=None,
        base_url: str | None = None,
    ) -> None:
        import anthropic

        self._client = anthropic.AsyncAnthropic(
            api_key=api_key,
            **({"http_client": http_client} if http_client else {}),
            **({"base_url": base_url} if base_url else {}),
        )
        self._model = model

    async def extract(self, capture: CaptureInput) -> CaptureExtraction:
        import anthropic

        try:
            response = await self._client.messages.parse(
                model=self._model,
                max_tokens=16000,
                system=EXTRACT_PROMPT,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": _content(capture)}],
                output_format=CaptureExtraction,
            )
        except anthropic.APIError as exc:  # network, rate limit, bad key, 5xx
            raise AnalysisFailed(f"{type(exc).__name__}: {exc}") from exc

        if response.stop_reason == "refusal":
            detail = getattr(response.stop_details, "explanation", None) or "no explanation"
            raise AnalysisFailed(f"model declined to read the notes ({detail})")

        parsed = response.parsed_output
        if parsed is None:
            raise AnalysisFailed("model returned no structured output")
        return parsed


def get_extractor() -> Extractor:
    """Follows AI_PROVIDER, like the analyzer. Not cached: settings change under tests."""
    settings = get_settings()
    provider = settings.ai_provider.lower()
    if provider == "stub":
        return StubExtractor()
    if provider == "claude":
        return ClaudeExtractor(settings.anthropic_api_key, settings.anthropic_model)
    if provider == "agent":
        from .agent import AgentExtractor

        return AgentExtractor(settings.anthropic_model)
    raise ValueError(
        f"Unknown AI_PROVIDER {settings.ai_provider!r}; expected 'stub', 'claude' or 'agent'"
    )
