"""Reading every source in one unit together.

A folder collects the material for one unit - a lecture, a textbook chapter, a
video, a page of notes. Filed separately they each produce their own concepts
and the student is left to notice that three of them are saying the same thing
in different words, and that only one of them mentioned the treaty.

This is the pass that notices for them. It reads what every source in the unit
produced and writes down three things that only exist *between* sources:

- where they agree, and which ones agree (a fact three sources bother to state
  is the fact the exam will ask about);
- what each source adds that no other one does (which is what makes it worth
  keeping, and what to go back to when that topic comes up);
- what none of them covers (the gap in the unit, which is invisible from inside
  any single source).

The digest is about the sources as sources. Anything that is just "what the
material says" belongs in a concept, and this must not become a second, worse
copy of the concepts.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..config import get_settings
from .base import AnalysisFailed


class Agreement(BaseModel):
    """One thing more than one source says."""

    model_config = ConfigDict(extra="forbid")

    claim: str = Field(
        description="What they agree on, as a claim: 'The war's debt is what caused the "
        "taxes', not 'They both discuss the war'."
    )
    sources: list[str] = Field(
        description="The titles of the sources that state it, exactly as given to you."
    )
    note: str | None = Field(
        default=None,
        description="Where they differ in emphasis or wording while agreeing on the "
        "substance. Null when they simply agree.",
    )


class Contribution(BaseModel):
    """What one source has that the others do not."""

    model_config = ConfigDict(extra="forbid")

    source: str = Field(description="The source's title, exactly as given to you.")
    adds: str = Field(
        description="What this one brings that no other source in the unit does - a "
        "worked example, a date, a counter-argument, a diagram, a framing. One or two "
        "sentences. This is what makes it worth going back to."
    )


class UnitDigest(BaseModel):
    """What the sources in one unit add up to."""

    model_config = ConfigDict(extra="forbid")

    overview: str = Field(
        description="What this unit is about, in two or three sentences, written from all "
        "the sources together rather than from any one of them."
    )
    agreements: list[Agreement] = Field(
        default_factory=list,
        description="What more than one source states. Ordered by how many say it: the "
        "thing every source bothered to include is the thing the exam asks about.",
    )
    contributions: list[Contribution] = Field(
        default_factory=list,
        description="One entry per source that adds something the others do not. A source "
        "that is genuinely redundant gets no entry, and that is worth knowing too.",
    )
    conflicts: list[str] = Field(
        default_factory=list,
        description="Where two sources actually disagree - different dates, different "
        "causes, incompatible definitions. Name both sides. Empty when they do not.",
    )
    gaps: list[str] = Field(
        default_factory=list,
        description="What this unit would normally cover that none of these sources does. "
        "At most four, and only where you are confident. Empty rather than speculative.",
    )


class UnitInput(BaseModel):
    """The unit, and every source in it as it was already read."""

    unit: str
    subject: str | None = None
    instructions: str | None = None
    # One block per material: its title, kind, summary, and the concepts filed
    # from it. The concepts rather than the original text, because the text is
    # not kept and the concepts are already the distilled version of it.
    sources: list[str] = Field(default_factory=list)

    def render(self) -> str:
        parts = [f"Unit: {self.unit}"]
        if self.subject:
            parts.append(f"Subject: {self.subject}")
        if self.instructions:
            parts.append(
                "The student's standing brief for this unit, which applies here too:\n"
                f"<instructions>\n{self.instructions}\n</instructions>"
            )
        parts.append("The sources filed in this unit:\n\n" + "\n\n".join(self.sources))
        return "\n\n".join(parts)


UNIT_PROMPT = """\
You are reading every source a student filed into one unit, together, and writing \
down what is true *between* them. That is the whole job: anything that is simply \
"what the material says" is already filed as a concept, and repeating it here \
produces a second, worse copy of their notes.

Three things only exist between sources, and they are what you are for.

**Agreement.** When two or three sources bother to state the same thing, that is \
the unit's spine and very probably the exam's. Say it as a claim, and name which \
sources state it. Where they agree on substance but differ in emphasis or wording, \
say so - that difference is often the thing that makes it click.

**Contribution.** What does each source have that no other one does? A worked \
example, a date, a counter-argument, a diagram, a way of framing it. This is what \
makes a source worth going back to, and a student with four sources and no idea \
which to reread is the problem you are solving. A source that really is redundant \
gets no entry; do not invent a contribution to be polite.

**Absence.** Where do the sources disagree, and what does the unit not cover at \
all? A gap is invisible from inside any single source and is the most useful thing \
on this page. Only name gaps you are confident about - "no source here works a \
numerical example" is useful, a guess about the syllabus is not.

Name sources by their titles exactly as given. Do not invent material, and do not \
smooth over a disagreement to make the unit look tidier than it is.\
"""


class UnitWriter(Protocol):
    name: str

    async def write(self, unit: UnitInput) -> UnitDigest: ...


class StubUnitWriter:
    """Offline: counts what it was given, and says that is all it did."""

    name = "stub"

    async def write(self, unit: UnitInput) -> UnitDigest:
        return UnitDigest(
            overview=(
                f"{len(unit.sources)} source(s) filed in {unit.unit}. "
                "(Offline writer: set AI_PROVIDER=claude or agent to have them read together.)"
            ),
            agreements=[],
            contributions=[],
            conflicts=[],
            gaps=[],
        )


def get_unit_writer() -> UnitWriter:
    """Follows AI_PROVIDER, like the extractor. Not cached: settings move under tests."""
    settings = get_settings()
    provider = settings.ai_provider.lower()
    if provider == "stub":
        return StubUnitWriter()
    if provider == "claude":
        from .claude import ClaudeUnitWriter

        return ClaudeUnitWriter(settings.anthropic_api_key, settings.anthropic_model)
    if provider == "agent":
        from .agent import AgentUnitWriter

        return AgentUnitWriter(settings.anthropic_model)
    raise AnalysisFailed(f"Unknown AI_PROVIDER {settings.ai_provider!r}")
