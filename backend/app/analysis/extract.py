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
from .card import ConceptCard

CaptureKind = Literal["image", "pdf", "text", "audio", "video"]

# The scenes the map can draw. Closed, and mirrored exactly by MOTIF_ART in
# `frontend/src/components/app/motifs.tsx` — a name the model invents is a card
# with a blank where its picture should be, so the model is given the list and
# the app draws whichever one comes back.
Motif = Literal[
    "crown", "flag", "battle", "carriage", "ship", "assembly", "law", "money",
    "factory", "treaty", "map", "idea", "flask", "cell", "atom", "brain",
    "equation", "graph", "book", "clock", "institution",
]


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
    # The student's own standing instructions for how to read any material:
    # how broad the concepts should be, how long, in what voice, what to skip.
    # Read before the material is turned into anything, and allowed to override
    # the house style in the system prompt.
    instructions: str | None = None
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
    card: ConceptCard | None = Field(
        default=None,
        description="The card this concept is revised from: its one-line takeaway, the "
        "keyword it turns on, the phrasing an exam uses for it, the picture to think with, "
        "the mistake it is built to catch, and a line short enough to still be there "
        "tomorrow. Fill it for every concept - it is the part the student actually reads.",
    )
    motif: Motif | None = Field(
        default=None,
        description="The scene the map should draw for this concept. Pick the one that shows "
        "what it is *about*, not the subject it belongs to: 'battle' for a war breaking out, "
        "'carriage' for a flight or a journey, 'crown' for a monarchy, 'flag' for a rising or "
        "a republic, 'assembly' for a vote or a declaration, 'law' for an act or a "
        "constitution, 'treaty' for an alliance or a peace, 'money' for taxes or trade, "
        "'factory' for industry, 'ship' for a voyage or a colony, 'map' for territory, "
        "'institution' for a state body or a court, 'idea' for a doctrine or a philosophy, "
        "'clock' for a period or a sequence; 'brain', 'cell', 'atom', 'flask', 'equation', "
        "'graph' for their sciences; 'book' when nothing else fits. Null only if the concept "
        "genuinely has no shape.",
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
    parent_title: str | None = Field(
        default=None,
        description="The title of the broader concept in your own `concepts` list that "
        "this one belongs under - copy it exactly. 'The Battle of Yorktown' goes under "
        "'The American Revolution'. Null only for the handful of big organising "
        "concepts that are themselves the top of the map. Never point a concept at "
        "itself, and never make a chain longer than one level: every concept is either "
        "an organising one or a detail directly beneath one.",
    )
    order: int = Field(
        default=0,
        description="Where this sits in the order the material runs, counting from 1. "
        "Chronological when the material has a timeline (the French and Indian War "
        "before the Proclamation Line before the Stamp Act); the order of the steps "
        "when it is a method; otherwise what has to be understood first. Number the "
        "organising concepts 1, 2, 3 among themselves, and number the details 1, 2, 3 "
        "within their own parent - it is a position among siblings, not a global rank. "
        "Give every concept one, so the whole map reads in an order.",
    )
    when: str | None = Field(
        default=None,
        description="What that position is called, if the material says: '1763', "
        "'1775-1783', 'Step 2', 'Phase 1'. Null when the material is not laid out in "
        "time or in steps - do not invent dates that are not there.",
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
        description="The material organised as a two-level map, parents before their "
        "own children. First the handful of big organising concepts it is really "
        "about (parent_title null) - usually two to six, the ones a student would name "
        "if asked what the material covered. Then, under each, the details that belong "
        "to it, every one that is worth remembering. An empty list only if the material "
        "contains nothing worth remembering."
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

    It approximates the two-level map the real extractor builds by treating the
    first paragraph as the organising concept and hanging the rest beneath it. That
    is a crude rule and would be wrong on real notes, but offline the point is to
    produce the *shape* - a parent with children - so the map has a tree to draw
    and the filing code has parents to resolve.
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
                    # The first one found is the branch; everything after it hangs
                    # off that branch. One level deep, never itself.
                    parent_title=concepts[0].title if concepts else None,
                    # Offline there is no reading to infer an order from, so the
                    # order the material is written in is the order. Branches count
                    # from 1 among branches; details from 1 within their branch -
                    # which here is just their position after the first paragraph.
                    order=max(1, len(concepts)),
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
distinction, a trap. Title each one as something the student can recall, and write its \
body as the note they would want to re-read a month later, keeping their own examples \
and phrasing where they exist. Do not invent material that is not there, and do not pad \
a single idea into several.

**Organise what you find into two levels, because the result is drawn as a mind map.**

The top level is the handful of big ideas the material is really about - "The American \
Revolution", "The Enlightenment", "Cell transport". Usually two to six of them. These \
are what a student would name if you asked what the material covered, and each one is \
the middle of its own branch of the map. Give each a body that says what the whole \
branch is about and why its parts hang together, not a definition of the phrase.

Everything else is a detail, and every detail names its parent with parent_title: "The \
Battle of Yorktown", "Thomas Paine's Common Sense" and "The Proclamation Line of 1763" \
all sit under "The American Revolution". Be thorough here - a detail worth remembering \
should be in the map - but a detail is still a thing worth remembering, not every \
sentence that was said. If a passage only restates the idea above it, it is not a \
concept; fold it into that concept's body instead. Forty flat, similar concepts is the \
failure to avoid: the same material as six branches with their details underneath is \
what the student actually wanted.

If the material genuinely covers one idea only, that is one top-level concept with its \
details beneath - do not invent branches to fill a map.

**Then put what you found in order, with `order`.** A map that reads in an order is the \
difference between a pile of facts and a story the student can walk through. For history \
that order is the calendar: the French and Indian War, then the Proclamation Line, then \
the Stamp Act, then the war. For a method it is the steps in the order they are carried \
out. For anything else it is what has to be understood before what. Number the top-level \
concepts 1, 2, 3 among themselves, and number each branch's details 1, 2, 3 within that \
branch - a position among its siblings, not a rank across the whole map. Every concept \
gets one, so nothing is left sitting outside the sequence.

Where the material names the moment - a year, a range, a numbered step - put that in \
`when`: "1763", "1775-1783", "Step 2". It is the caption on the arrow, and the student \
sees it. Leave it null rather than inventing a date the material never gave; plenty of \
material has a real order and no dates at all.

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
against a single correct answer.

**Every concept gets a card.** The body is the full note; the card is what gets \
revised from the night before, and it is not a summary of the body - it is a \
different set of claims. One line that *is* the concept, the single word it turns \
on, the phrasing an exam wears when it is really asking this, a picture to think \
with, the neighbouring idea it gets confused with, and a hook short enough to \
survive until morning. Leave any part null rather than padding it; an empty \
section costs nothing and a limp one costs trust in the whole card. A figure only \
where the concept really is a table, a sequence or a set of parts.

**The student may tell you how they want this read.** When the turn carries a block \
headed "How the student wants this read", read it before anything else and follow it. \
It is their bank and their revision, and it outranks the house style above wherever the \
two disagree: how broad or how fine the concepts are, how long the bodies run, what \
voice to write in, what vocabulary to keep, what to leave out entirely, whether to \
write questions at all and how hard they should be.

Four things it cannot change, because the app breaks rather than bends: the two levels, \
because the result is drawn as a map; an `order` on every concept, because the map draws \
arrows with it; titles that are recallable rules rather than bare topics; and the rule \
against inventing material the notes do not contain. If their instructions ask for \
something those four forbid, follow the instruction as far as it will go and say what \
you could not do in `summary`, in one sentence.

An instruction that asks for something about the *material* rather than the format - \
"only the parts about photosynthesis", "skip the worked examples" - is a filter, and \
filtering is allowed: leave that material out rather than reshaping it.\
"""


_TEXT_LABELS = {
    "audio": "Transcript of the recording",
    "video": "Transcript of the video",
    "text": "The notes",
}


def _instruction_block(capture: CaptureInput) -> str | None:
    """The student's own instructions, quoted and named as theirs.

    Fenced and labelled rather than pasted in loose: what arrives here is typed
    by a student into a box, and the model has to be able to tell where their
    wishes end and the material begins.
    """
    text = (capture.instructions or "").strip()
    if not text:
        return None
    return (
        "How the student wants this read — their words, and they take precedence "
        "over the house style:\n<instructions>\n" + text + "\n</instructions>"
    )


def _existing_block(capture: CaptureInput) -> str:
    if not capture.existing:
        return "Concepts already in the bank: (none yet)"
    lines = [f"- {c.title}" + (f" [{c.subject}]" if c.subject else "") for c in capture.existing]
    return "Concepts already in the bank:\n" + "\n".join(lines)


def _tail(capture: CaptureInput) -> str:
    """Everything that follows the material: what is already filed, the steers,
    and the order to go ahead.

    One function because there are two adapters, and an instruction that reached
    only one of them would be a setting that works or does not depending on a
    provider the student cannot see.
    """
    parts = [_existing_block(capture)]
    if capture.subject_hint:
        parts.append(f"The student says these notes are about: {capture.subject_hint}")
    block = _instruction_block(capture)
    if block:
        parts.append(block)
    parts.append(
        "Read their instructions first if they gave any, then extract the concepts."
        if block
        else "Extract the concepts."
    )
    return "\n\n".join(parts)


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

    blocks.append({"type": "text", "text": _tail(capture)})
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
