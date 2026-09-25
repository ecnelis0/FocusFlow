"""The shape every concept is filed in.

A concept used to be a title and a paragraph. A paragraph is what you write
when you understand something and the worst thing to revise from: it hides
where one idea ends, it buries the one line that would have been enough, and it
never says what the question will look like on the paper.

So a concept is now a card with named parts, each of which has a job:

- `takeaway`   — the one line to have read if you read nothing else.
- `keyword`    — the single word that unlocks it in an exam.
- `exam_cue`   — the phrasing a question uses when it is really asking this.
- `mental_model` — the picture to think with, in two or three sentences.
- `figure`     — the same closed vocabulary the notes draw from, for the
                 concepts that are really a table or a sequence.
- `trap`       — the mistake this concept is designed to catch you with.
- `hook`       — a line short enough to still be in your head tomorrow.

Every part is optional except the takeaway. A concept with nothing to trap you
should say nothing rather than inventing a trap, and an empty section is quietly
dropped by the renderer.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..config import get_settings
from .base import AnalysisFailed
from .notes import NoteFigure


class ConceptCard(BaseModel):
    """One concept, in the shape it is revised from."""

    model_config = ConfigDict(extra="forbid")

    takeaway: str = Field(
        description="The whole concept in one sentence, under 90 characters. The sentence "
        "to have read if you read nothing else. 'Deciding whether a stimulus is present "
        "under uncertainty', not 'This concept is about signal detection'."
    )
    keyword: str | None = Field(
        default=None,
        description="The one word this concept turns on - 'Uncertainty', 'Reciprocal', "
        "'Marginal'. One word, two at the very most. Null if no single word carries it.",
    )
    exam_cue: str | None = Field(
        default=None,
        description="The phrasing a question uses when it is really asking about this, "
        "quoted as it would appear: \"notice a faint sound\", \"as price rises\". This is "
        "what lets the student recognise the concept in the wild. Null if it has no tell.",
    )
    mental_model: str | None = Field(
        default=None,
        description="The picture to think with: an analogy, a scenario, a way of seeing it. "
        "Two or three sentences, addressed to the student. Keep the material's own image "
        "where it has one rather than inventing a second.",
    )
    figure: NoteFigure | None = Field(
        default=None,
        description="A figure, for a concept that is really a table, a sequence or a set of "
        "parts - a 2x2 of outcomes, the steps of a process, the pieces of a structure. Null "
        "for concepts that are a single idea, which is most of them.",
    )
    trap: str | None = Field(
        default=None,
        description="The mistake this concept is built to catch: the neighbouring idea it "
        "gets confused with, or the wrong answer that looks right. Say it as the confusion "
        "itself - 'a false alarm, not a miss'. Null if the concept genuinely sets none.",
    )
    hook: str | None = Field(
        default=None,
        description="A line short enough to still be there tomorrow: a rhyme, a pun, an "
        "image. 'False alarm = fire drill when there's no fire.' Null rather than a limp one.",
    )


class CardInput(BaseModel):
    """What the writer is given about one concept."""

    title: str
    body: str
    subject: str | None = None
    unit: str | None = None
    # The questions already filed under it: the best possible evidence of how
    # this concept is actually asked about.
    questions: list[str] = Field(default_factory=list)

    def render(self) -> str:
        parts = [f"Concept: {self.title}"]
        where = " · ".join(p for p in (self.subject, self.unit) if p)
        if where:
            parts.append(f"Filed under: {where}")
        parts.append(f"What is written about it:\n{self.body}")
        if self.questions:
            parts.append(
                "Questions already filed under it - these are how it gets asked:\n"
                + "\n".join(self.questions)
            )
        return "\n\n".join(parts)


CARD_PROMPT = """\
You are turning one concept into the card a student revises from the night before.

The test for every part is whether it would help in an exam. A line that restates \
the title, or says the concept "is important", is worse than no line: it is one \
more thing to read and nothing to remember. Leave a part null rather than filling \
it with something limp - the card is read as a whole, and one empty section costs \
nothing while one padded section costs trust in all of them.

The **takeaway** is the concept itself, said once, in the student's direction: \
what it *is*, not what it is about.

The **keyword** is the single word that unlocks it under pressure. The **exam cue** \
is the phrasing a question wears when it is really asking this - the thing that \
makes the student think "ah, this one". Quote it the way a paper would word it.

The **mental model** is the picture to think with. Use the material's own image if \
it has one. Address the student: "Imagine you are listening for a faint alarm in a \
noisy room."

A **figure** only where the concept really is a table, a sequence or a set of parts \
- a 2x2 of outcomes, the steps of a method, the pieces of a structure. Most \
concepts are one idea and need none.

The **trap** is what this concept is built to catch: the neighbour it is confused \
with, the attractive wrong answer. Name the confusion itself.

The **hook** is a line that survives until tomorrow morning. A rhyme, a pun, a \
picture. If nothing good comes, leave it null; a bad mnemonic is worse than none, \
because it gets remembered instead of the concept.

Use only what the material gives you. Do not invent facts, dates or examples that \
are not there.\
"""


class CardWriter(Protocol):
    name: str

    async def write(self, concept: CardInput) -> ConceptCard: ...


class StubCardWriter:
    """Offline: reshapes the body so the whole loop runs without a key.

    It cannot judge what the one line is - that is the entire job - so it says
    plainly that it did not, rather than dressing the first sentence up as a
    takeaway.
    """

    name = "stub"

    async def write(self, concept: CardInput) -> ConceptCard:
        first = concept.body.strip().split(". ")[0].strip() if concept.body.strip() else ""
        return ConceptCard(
            takeaway=(first[:90] or concept.title[:90]),
            keyword=None,
            exam_cue=None,
            mental_model="(Offline writer: set AI_PROVIDER=claude or agent for a real card.)",
            figure=None,
            trap=None,
            hook=None,
        )


def get_card_writer() -> CardWriter:
    """Follows AI_PROVIDER, like the extractor. Not cached: settings move under tests."""
    settings = get_settings()
    provider = settings.ai_provider.lower()
    if provider == "stub":
        return StubCardWriter()
    if provider == "claude":
        from .claude import ClaudeCardWriter

        return ClaudeCardWriter(settings.anthropic_api_key, settings.anthropic_model)
    if provider == "agent":
        from .agent import AgentCardWriter

        return AgentCardWriter(settings.anthropic_model)
    raise AnalysisFailed(f"Unknown AI_PROVIDER {settings.ai_provider!r}")
