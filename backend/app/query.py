"""Structured queries over the bank.

The assistant does not answer from memory or from a blob of context. It turns a
question into one of these, the database answers it, and only then does the model
get to say anything - so a count is a count and a list is the real list.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import (
    Concept,
    Folder,
    Material,
    Mistake,
    mistake_options,
)

Sort = Literal["newest", "oldest"]


class Vocabulary(BaseModel):
    """What this particular bank actually contains.

    Handed to the model before it writes a filter. Without it, "questions about
    circles" or "everything under the circumference concept" cannot be turned into a
    filter at all - the model would be guessing at strings it has never seen.
    """

    tags: list[str] = Field(
        default_factory=list,
        description="The student's own labels, e.g. 'by mistake'. Matched exactly, ignoring case.",
    )
    subjects: list[str] = Field(
        default_factory=list,
        description="The subjects the student has logged under, e.g. 'Biology'. Free "
        "text, so these are the only spellings that exist.",
    )
    topics: list[str] = Field(default_factory=list)
    concepts: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)

    def render(self) -> str:
        def block(title: str, values: list[str]) -> str:
            return f"{title}: {', '.join(values) if values else '(none yet)'}"

        return "\n".join(
            [
                block("Subjects in this bank", self.subjects),
                block("Topics in this bank", self.topics),
                block("Tags the student uses", self.tags),
                block("Concepts the student has written", self.concepts),
                block("Sources", self.sources),
            ]
        )


class BankQuery(BaseModel):
    """What the student asked for, in terms the database understands.

    Every list is OR within itself and AND across fields: `topics=[circles,
    tangents], subjects=[Geometry]` means "circles or tangents, *and* Geometry".
    """

    model_config = ConfigDict(extra="forbid")

    concept_ids: list[str] = Field(
        default_factory=list,
        description="Concept ids. The category rail sets these; the model uses "
        "`concepts` instead, which takes titles.",
    )
    concepts: list[str] = Field(
        default_factory=list,
        description="Concept titles, copied from the list of concepts you were given. "
        "Matched as substrings, case-insensitively.",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="The student's own labels, copied from the tags you were given, "
        "e.g. 'by mistake'. Matched exactly, ignoring case.",
    )
    subjects: list[str] = Field(
        default_factory=list,
        description="Subjects, copied exactly from the subjects you were given, e.g. "
        "'Biology'. Matched as whole strings, ignoring case.",
    )
    topics: list[str] = Field(
        default_factory=list,
        description="Topic words to match, e.g. 'circles'. Matched as substrings.",
    )
    folder_ids: list[str] = Field(
        default_factory=list,
        description="Topic folder ids. The bank page sets these when a folder is "
        "open; you have no ids to copy, so leave this empty and filter by subject "
        "or by topic words instead.",
    )
    text: str | None = Field(
        default=None, description="Words that must appear in the question itself."
    )
    logged_after: date | None = Field(
        default=None,
        description="Only questions logged on or after this date. Resolve relative "
        "phrases like 'the past 3 months' against today's date, given in the prompt.",
    )
    logged_before: date | None = Field(
        default=None, description="Only questions logged on or before this date."
    )
    has_concept: bool | None = Field(
        default=None,
        description="True for questions filed under some concept, False for the ones "
        "filed under none. Leave unset for both.",
    )
    has_folder: bool | None = Field(
        default=None,
        description="False for questions in a subject but not yet in any of its topic "
        "folders - what the bank's 'Unfiled' card shows. Leave unset for both.",
    )
    sort: Sort = "newest"
    limit: int = Field(default=25, ge=1, le=100)


# What a text search looks at. The question alone is not enough: people search for
# where a question came from ("Textbook"), for an answer ("36"), or for the topic.
SEARCHABLE = (
    Mistake.question_text,
    Mistake.source,
    Mistake.correct_answer,
    Mistake.student_note,
    Mistake.topic,
)


def text_filter(term: str):
    """Every word must appear somewhere; each word may appear in any field.

    So "area circle" finds a question about the area of a circle even though those
    two words never sit next to each other - which a single LIKE '%area circle%'
    cannot do, and which is how the old search returned nothing for most phrases.
    """
    words = [word for word in term.split() if word]
    if not words:
        return None
    return and_(*[or_(*[column.ilike(f"%{word}%") for column in SEARCHABLE]) for word in words])


def build_statement(user_id: str, query: BankQuery):
    stmt = select(Mistake).where(Mistake.user_id == user_id).options(*mistake_options())

    if query.concept_ids:
        stmt = stmt.where(Mistake.concepts.any(Concept.id.in_(query.concept_ids)))
    if query.concepts:
        stmt = stmt.where(
            Mistake.concepts.any(
                or_(*[Concept.title.ilike(f"%{title}%") for title in query.concepts])
            )
        )
    if query.subjects:
        # Whole strings, not substrings: "Math" must not pull in "Mathematical logic".
        # Case-insensitive because the model and the student both type these freely.
        stmt = stmt.where(
            func.lower(Mistake.subject).in_([subject.lower() for subject in query.subjects])
        )
    if query.tags:
        # tags is a JSON array, so this is a substring match on the serialised list.
        # Quoted to stop "guessed" matching a tag that merely contains it.
        stmt = stmt.where(
            or_(*[Mistake.tags.cast(String).ilike(f'%"{tag}"%') for tag in query.tags])
        )
    if query.topics:
        stmt = stmt.where(or_(*[Mistake.topic.ilike(f"%{topic}%") for topic in query.topics]))
    if query.folder_ids:
        stmt = stmt.where(Mistake.folder_id.in_(query.folder_ids))
    if query.text:
        clause = text_filter(query.text)
        if clause is not None:
            stmt = stmt.where(clause)
    if query.logged_after:
        stmt = stmt.where(
            Mistake.created_at >= datetime.combine(query.logged_after, time.min, tzinfo=UTC)
        )
    if query.logged_before:
        stmt = stmt.where(
            Mistake.created_at <= datetime.combine(query.logged_before, time.max, tzinfo=UTC)
        )
    if query.has_concept is not None:
        tagged = Mistake.concepts.any()
        stmt = stmt.where(tagged if query.has_concept else ~tagged)
    if query.has_folder is not None:
        stmt = stmt.where(
            Mistake.folder_id.is_not(None) if query.has_folder else Mistake.folder_id.is_(None)
        )

    order = {
        "newest": Mistake.created_at.desc(),
        "oldest": Mistake.created_at.asc(),
    }.get(query.sort)
    # Newest first when the sort is unrecognised: with the review queue gone there
     # is no ranking left to fall back to, and an unordered statement is a different
     # answer on every driver.
    stmt = stmt.order_by(order if order is not None else Mistake.created_at.desc())

    return stmt.limit(query.limit)


async def run_query(session: AsyncSession, user_id: str, query: BankQuery) -> list[Mistake]:
    result = await session.scalars(build_statement(user_id, query))
    return list(result)


def describe(query: BankQuery) -> str:
    """A plain-English readback of the filter, so the student can see what was searched."""
    parts: list[str] = []
    if query.concepts:
        parts.append("under " + " or ".join(query.concepts))
    if query.concept_ids:
        count = len(query.concept_ids)
        parts.append(f"under {count} concept{'' if count == 1 else 's'}")
    if query.subjects:
        parts.append("in " + " or ".join(query.subjects))
    if query.tags:
        parts.append("tagged " + " or ".join(query.tags))
    if query.topics:
        parts.append("about " + " or ".join(query.topics))
    if query.text:
        parts.append(f"mentioning {query.text!r}")
    if query.logged_after and query.logged_before:
        parts.append(f"logged between {query.logged_after} and {query.logged_before}")
    elif query.logged_after:
        parts.append(f"logged since {query.logged_after}")
    elif query.logged_before:
        parts.append(f"logged before {query.logged_before}")
    if query.folder_ids:
        count = len(query.folder_ids)
        parts.append(f"in {count} folder{'' if count == 1 else 's'}")
    if query.has_concept is True:
        parts.append("filed under a concept")
    elif query.has_concept is False:
        parts.append("not filed under any concept")
    if query.has_folder is False:
        parts.append("not in any folder")
    elif query.has_folder is True:
        parts.append("in a folder")

    return ", ".join(parts) if parts else "everything in the bank"


async def vocabulary(session: AsyncSession, user_id: str) -> Vocabulary:
    """The distinct values in this student's bank, for the model to choose from."""
    subjects = await session.scalars(
        select(Mistake.subject)
        .where(Mistake.user_id == user_id, Mistake.subject.is_not(None))
        .distinct()
    )
    topics = await session.scalars(
        select(Mistake.topic)
        .where(Mistake.user_id == user_id, Mistake.topic.is_not(None))
        .distinct()
    )
    sources = await session.scalars(
        select(Mistake.source)
        .where(Mistake.user_id == user_id, Mistake.source.is_not(None))
        .distinct()
    )
    concepts = await session.scalars(
        select(Concept.title).where(Concept.user_id == user_id).distinct()
    )
    tag_rows = await session.scalars(
        select(Mistake.tags).where(Mistake.user_id == user_id, Mistake.tags.is_not(None))
    )
    tags = sorted({tag for row in tag_rows for tag in (row or [])})
    return Vocabulary(
        subjects=sorted(subjects),
        topics=sorted(topics),
        concepts=sorted(concepts),
        sources=sorted(sources),
        tags=tags,
    )


def _rank(pairs: list[tuple[str, int]]) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for key, n in pairs:
        counts[key] = counts.get(key, 0) + n
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))


def overview(mistakes: list[Mistake]) -> str:
    """Counts across the matched rows.

    Questions like "what am I worst at" are answered from these, not by asking the
    model to tally a list by eye - which it will do approximately, and confidently.
    """
    if not mistakes:
        return ""

    def tally(values: list[str]) -> str:
        counts: dict[str, int] = {}
        for value in values:
            counts[value] = counts.get(value, 0) + 1
        ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return ", ".join(f"{key} ({count})" for key, count in ranked)

    lines = [
        f"By topic: {tally([m.topic for m in mistakes if m.topic])}",
        f"By subject: {tally([m.subject or 'no subject' for m in mistakes])}",
    ]
    concepts = [concept.title for m in mistakes for concept in m.concepts]
    if concepts:
        lines.append(f"By concept: {tally(concepts)}")
    return "\n".join(lines)


async def bank_context(session: AsyncSession, user_id: str, limit: int = 300) -> str:
    """Everything in the bank, compactly, so the assistant answers from the whole
    picture and not only the rows a filter happened to match.

    Concepts with what the student wrote about them, every question with its
    topic, tags and concepts, and the totals. Facts only - the counting is done
    here, not by the model.
    """
    concepts = list(
        await session.scalars(
            select(Concept)
            .where(Concept.user_id == user_id)
            .options(selectinload(Concept.mistakes))
            .order_by(Concept.subject, Concept.title)
        )
    )
    mistakes = list(
        await session.scalars(
            select(Mistake)
            .where(Mistake.user_id == user_id)
            .options(*mistake_options())
            .order_by(Mistake.created_at.desc())
            .limit(limit)
        )
    )
    lines = [
        f"BANK TOTALS: {len(mistakes)} questions, {len(concepts)} concepts.",
        "",
        "CONCEPTS (title | subject | questions filed | the student's own notes):",
    ]
    for c in concepts:
        note = " ".join((c.body or "").split())[:240]
        lines.append(f"- {c.title} | {c.subject or '-'} | {len(c.mistakes)} | {note or '-'}")
    if not concepts:
        lines.append("- (none yet)")

    lines += ["", "QUESTIONS, newest first:"]
    for m in mistakes:
        lines.append(
            f"- id={m.id} added={m.created_at.date()} subject={m.subject or '-'} "
            f"topic={m.topic or '-'} source={m.source or '-'} "
            f"tags={','.join(m.tags or []) or '-'} "
            f"concepts={'; '.join(c.title for c in m.concepts) or '-'} "
            f'q="{m.question_text[:100]}" answer={m.correct_answer!r}'
        )
        if m.student_note:
            lines.append(f"    student's note: {m.student_note[:160]}")
    if not mistakes:
        lines.append("- (none yet)")

    units = await units_context(session, user_id)
    if units:
        lines += ["", units]
    return "\n".join(lines)


async def units_context(session: AsyncSession, user_id: str) -> str:
    """The units, their sources, and what reading those sources together found.

    "Give me everything for this unit" is one of the two or three questions a
    student most wants to ask, and the bank listing alone cannot answer it: it
    knows concepts and questions, and a unit is a set of *sources*. This section
    is what makes that question answerable — which materials make up each unit,
    the synthesis written across them, and what is filed under it.
    """
    folders = list(
        await session.scalars(
            select(Folder)
            .where(Folder.user_id == user_id)
            .options(selectinload(Folder.subject))
            .order_by(Folder.position)
        )
    )
    if not folders:
        return ""

    materials = list(
        await session.scalars(
            select(Material).where(Material.user_id == user_id, Material.folder_id.is_not(None))
        )
    )
    concepts = list(
        await session.scalars(
            select(Concept).where(Concept.user_id == user_id, Concept.folder_id.is_not(None))
        )
    )

    lines = ["UNITS (a unit is a folder: several sources filed together):"]
    for folder in folders:
        mine = [m for m in materials if m.folder_id == folder.id]
        theirs = [c for c in concepts if c.folder_id == folder.id]
        lines.append(
            f"- {folder.name} [{folder.subject.name}] — {len(mine)} source(s), "
            f"{len(theirs)} concept(s)"
        )
        if folder.instructions:
            lines.append(f"    the student's brief for it: {folder.instructions[:300]}")
        for material in mine:
            lines.append(f"    source: {material.title} ({material.kind})")
        digest = folder.digest or {}
        if digest.get("overview"):
            lines.append(f"    read together: {digest['overview'][:400]}")
        for agreement in (digest.get("agreements") or [])[:6]:
            says = ", ".join(agreement.get("sources") or [])
            lines.append(f"    agreed by [{says}]: {agreement.get('claim', '')[:200]}")
        for contribution in (digest.get("contributions") or [])[:6]:
            lines.append(
                f"    only in {contribution.get('source', '?')}: "
                f"{contribution.get('adds', '')[:200]}"
            )
        for conflict in (digest.get("conflicts") or [])[:4]:
            lines.append(f"    they disagree: {conflict[:200]}")
        for gap in (digest.get("gaps") or [])[:4]:
            lines.append(f"    not covered by any source: {gap[:200]}")
    return "\n".join(lines)


def digest(mistakes: list[Mistake]) -> str:
    """A compact rendering of the results for the model to summarise. Facts only."""
    if not mistakes:
        return "No questions matched."

    lines = [f"{len(mistakes)} question(s) matched.", "", overview(mistakes), "", "Rows:"]
    for index, mistake in enumerate(mistakes, start=1):
        concepts = ", ".join(concept.title for concept in mistake.concepts) or "-"
        lines.append(
            f"{index}. [{mistake.subject or 'no subject'}] topic={mistake.topic or '-'} "
            f"concepts={concepts} added={mistake.created_at.date()} "
            f'question="{mistake.question_text[:120]}" '
            f"answer={mistake.correct_answer!r}"
        )
    return "\n".join(lines)
