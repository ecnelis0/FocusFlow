"""Turning what was filed into a page of notes worth re-reading.

A capture already produces concepts, and a concept is a paragraph: correct, and
not what anyone revises from the night before. Notes are the other shape — a
tight page with headings, a handful of lines under each that are actually worth
remembering, and a figure beside them where a picture says it faster than a
sentence.

The figures are a closed vocabulary on purpose. Asking a model for "a diagram"
gets prose describing one, or SVG that renders like a ransom note; asking it for
four named shapes it can fill in gets something the app can draw properly and
style to match the rest of the product. Add a member here rather than letting
the model invent one - `figures.tsx` has to know how to draw it.

The source is the material's own concepts and questions rather than its original
text. The text is not kept (a PDF's bytes are not ours to store), and the
concepts are already the distilled version of it, in order, with the traps
called out. Writing notes from them is writing from the good notes, not from the
raw transcript.
"""

from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..config import get_settings
from .base import AnalysisFailed

FigureKind = Literal["timeline", "process", "parts", "compare"]


class NoteStep(BaseModel):
    """One entry in a timeline or a process."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(
        description="What to print on the marker: a year, a date, a step number, "
        "a short name. Under 24 characters."
    )
    text: str = Field(description="What happened or what to do, in one short line.")


class NotePart(BaseModel):
    """One labelled part of a thing being pulled apart."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="The part's name, e.g. 'Axon' or 'Third Estate'.")
    text: str = Field(description="What it does or why it matters, in one short line.")


class NoteRow(BaseModel):
    """One line of a comparison, with a cell per column."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(description="What is being compared on this line, e.g. 'Energy'.")
    cells: list[str] = Field(
        description="One short cell per column, in the same order as `columns`."
    )


class NoteFigure(BaseModel):
    """A picture the app can actually draw, described as data.

    Only the fields its `kind` uses are filled; the rest stay empty.
    """

    model_config = ConfigDict(extra="forbid")

    kind: FigureKind = Field(
        description="'timeline' for things that happened in order and have dates; "
        "'process' for steps carried out in order; 'parts' for one thing pulled "
        "apart into labelled pieces; 'compare' for two or three things set against "
        "each other on shared criteria."
    )
    title: str = Field(description="What the figure shows. A short phrase, not a sentence.")
    steps: list[NoteStep] = Field(
        default_factory=list,
        description="For 'timeline' and 'process', in order. Three to seven. Empty otherwise.",
    )
    centre: str | None = Field(
        default=None, description="For 'parts', the thing being pulled apart. Null otherwise."
    )
    parts: list[NotePart] = Field(
        default_factory=list,
        description="For 'parts', three to seven labelled pieces. Empty otherwise.",
    )
    columns: list[str] = Field(
        default_factory=list,
        description="For 'compare', the two or three things being contrasted. Empty otherwise.",
    )
    rows: list[NoteRow] = Field(
        default_factory=list,
        description="For 'compare', the criteria they are contrasted on. Empty otherwise.",
    )


class NoteSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    heading: str = Field(
        description="A short heading, the kind you would write in the margin. Not a sentence."
    )
    points: list[str] = Field(
        description="Two to five lines that are worth remembering. Each one a fact, a rule or "
        "a distinction - not a summary of the section, and not a restatement of the heading. "
        "If a line would not help in an exam, leave it out."
    )
    figure: NoteFigure | None = Field(
        default=None,
        description="A figure for this section, when one genuinely helps. Null when the "
        "points say it better than a picture would - most sections do not need one.",
    )


class NoteDocument(BaseModel):
    """A page of notes: what it is, what matters, and what people get wrong."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(description="What this page of notes is about. A few words.")
    in_a_sentence: str = Field(
        description="The whole thing in one sentence, for the top of the page. The sentence "
        "you would want to have read if you only read one."
    )
    sections: list[NoteSection] = Field(
        description="Three to seven sections, in the order the material runs."
    )
    traps: list[str] = Field(
        default_factory=list,
        description="The mix-ups this material sets: pairs that look alike, rules applied to "
        "the wrong thing, the answer that is attractive and wrong. One line each, at most four. "
        "Empty if the material genuinely sets none.",
    )


class NoteInput(BaseModel):
    """What the writer is given: the material, as it was already read."""

    title: str
    kind: str
    summary: str | None = None
    subject: str | None = None
    # Concepts in the order the material runs, each "title — body".
    concepts: list[str] = Field(default_factory=list)
    # Practice questions with their answers, which say what is worth being able to do.
    questions: list[str] = Field(default_factory=list)

    def render(self) -> str:
        parts = [f"Material: {self.title} ({self.kind})"]
        if self.subject:
            parts.append(f"Subject: {self.subject}")
        if self.summary:
            parts.append(f"Summary of it: {self.summary}")
        parts.append("\nConcepts filed from it, in order:\n" + "\n\n".join(self.concepts))
        if self.questions:
            parts.append("\nQuestions filed from it:\n" + "\n".join(self.questions))
        return "\n".join(parts)


NOTES_PROMPT = """\
You are making a student's revision page out of material they have already filed.

The test for every line is the same: **would this help in an exam?** A line that \
restates the heading, or explains that a topic "is important", or pads out a point \
already made, is worse than no line - it is one more thing to read on the night \
before and nothing to remember. Cut it. Five sharp lines beat fifteen soft ones.

Write the points as facts, rules and distinctions, in the student's direction: \
"water moves toward the higher solute concentration" rather than "this section \
covers osmosis". Keep numbers, names and dates - those are what gets asked. Keep \
the material's own examples where it has them.

Put the sections in the order the material runs, and give each a short heading of \
the kind you would write in the margin.

**Figures.** Add one only where a picture genuinely says it faster than the lines \
do, and pick the shape that fits what is actually there:
- `timeline` - things that happened in order, with dates.
- `process` - steps carried out in order.
- `parts` - one thing pulled apart into labelled pieces (a neuron, a cell, an \
  argument, a branch of government).
- `compare` - two or three things set against each other on the same criteria.
Most sections need none. A figure that repeats the lines beside it is clutter; a \
`compare` with one column, or a `timeline` with two entries, is not a figure.

**Traps** are the mix-ups the material sets - the pair that looks alike, the rule \
applied to the wrong thing, the attractive wrong answer. These are what marks are \
lost on, so say them plainly. Leave the list empty rather than inventing one.

Do not invent material that was not given to you.\
"""


class NoteWriter(Protocol):
    name: str

    async def write(self, material: NoteInput) -> NoteDocument: ...


class StubNoteWriter:
    """Offline: reshapes what it was given, so the whole loop runs without a key.

    It cannot judge what matters - that is the entire job - so it says plainly
    that it did not, rather than dressing a mechanical split up as a summary.
    """

    name = "stub"

    async def write(self, material: NoteInput) -> NoteDocument:
        sections = [
            NoteSection(
                heading=" ".join(concept.split(" — ")[0].split())[:80],
                points=[line for line in concept.split(" — ")[1:] if line][:3]
                or ["(Offline writer: set AI_PROVIDER=claude for real notes.)"],
            )
            for concept in material.concepts[:6]
        ]
        if not sections:
            sections = [
                NoteSection(
                    heading="Nothing to write up yet",
                    points=["This material filed no concepts to make notes from."],
                )
            ]
        # One figure, so the renderer is exercised offline as well.
        if len(material.concepts) >= 3:
            sections[0].figure = NoteFigure(
                kind="process",
                title="In the order the material runs",
                steps=[
                    NoteStep(
                        label=str(index + 1),
                        text=" ".join(concept.split(" — ")[0].split())[:60],
                    )
                    for index, concept in enumerate(material.concepts[:5])
                ],
            )
        return NoteDocument(
            title=material.title,
            in_a_sentence=material.summary
            or "Notes from what was filed. (Offline writer: set AI_PROVIDER=claude.)",
            sections=sections,
            traps=[],
        )


def get_note_writer() -> NoteWriter:
    """Follows AI_PROVIDER, like the extractor. Not cached: settings move under tests."""
    settings = get_settings()
    provider = settings.ai_provider.lower()
    if provider == "stub":
        return StubNoteWriter()
    if provider == "claude":
        from .claude import ClaudeNoteWriter

        return ClaudeNoteWriter(settings.anthropic_api_key, settings.anthropic_model)
    if provider == "agent":
        from .agent import AgentNoteWriter

        return AgentNoteWriter(settings.anthropic_model)
    raise AnalysisFailed(f"Unknown AI_PROVIDER {settings.ai_provider!r}")
