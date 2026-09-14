"""Fill the bank with a believable month of mistakes, so the assistant has
something to reason about.

    cd backend && uv run python scripts/seed_demo.py [--reset]

Twenty questions across five subjects and ten concepts, logged over the past ten
weeks, with their review ladders played forward to today. Most are answered
correctly when they come round. One concept - the chain rule - is the one the
student keeps missing: four different questions under it, and every one of them
still wrong on review, so the ladder restarts each time. That is the pattern the
"what do I consistently get wrong" question has to find.

Every seeded row has a source starting with "Seed:" so `--reset` can remove
exactly what it added and nothing the student logged themselves.
"""

from __future__ import annotations

import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

from app.db import get_sessionmaker  # noqa: E402
from app.migrate import upgrade  # noqa: E402
from app.models import (  # noqa: E402
    AnalysisStatus,
    Concept,
    ErrorType,
    Mistake,
    ReviewEvent,
    ReviewOutcome,
    Urgency,
    new_id,
)
from app.review import LADDER  # noqa: E402

USER = "local"
NOW = datetime.now(UTC)
rng = random.Random(42)

# title, subject, body
CONCEPTS = [
    (
        "Chain rule: outside, keep the inside, times the inside's derivative",
        "Calculus",
        "d/dx f(g(x)) = f'(g(x)) · g'(x). The step everyone drops is the g'(x) at the end.",
    ),
    (
        "Integration by parts: pick u to be what gets simpler",
        "Calculus",
        "∫u dv = uv − ∫v du. Choose u by LIATE; if the new integral is harder, swap.",
    ),
    (
        "Osmosis moves water toward the higher solute concentration",
        "Biology",
        "Water crosses the membrane; solutes do not. Direction is toward MORE solute.",
    ),
    (
        "Mitochondria make ATP by cellular respiration",
        "Biology",
        "Glucose + O2 → CO2 + H2O + ATP. Chloroplasts do photosynthesis, not this.",
    ),
    (
        "Limiting reagent decides the yield",
        "Chemistry",
        "Convert every reactant to moles of product; the smallest number wins.",
    ),
    (
        "Le Chatelier: the system pushes back",
        "Chemistry",
        "Add a reactant, equilibrium shifts right. Raise temperature, it shifts to absorb heat.",
    ),
    (
        "Ser vs estar: permanent vs temporary",
        "Spanish",
        "Ser for identity and traits; estar for location, feelings and ongoing states.",
    ),
    (
        "Preterite vs imperfect",
        "Spanish",
        "Preterite for a completed action; imperfect for background, habit, description.",
    ),
    (
        "Causes of WWI: MAIN",
        "History",
        "Militarism, Alliances, Imperialism, Nationalism - and the assassination as the spark.",
    ),
    (
        "Reading the stem twice before answering",
        None,
        "Half the careless misses are answering a different question than the one asked.",
    ),
]

# concept index, subject, question, choices, yours, correct, error_type, topic, urgency,
# days_ago, review_script (outcome per rung reached), tags
QUESTIONS = [
    # --- The consistently-wrong concept: four different chain-rule questions, each
    #     still wrong when it came back. Recent, so "the past month" catches them.
    (
        0,
        "Calculus",
        "Differentiate y = sin(3x²).",
        None,
        "cos(3x²)",
        "6x·cos(3x²)",
        ErrorType.concept_gap,
        "chain rule",
        Urgency.fundamental,
        24,
        ["wrong", "wrong", "correct"],
        ["forgot the inside"],
    ),
    (
        0,
        "Calculus",
        "Find dy/dx for y = (2x + 1)⁵.",
        None,
        "5(2x + 1)⁴",
        "10(2x + 1)⁴",
        ErrorType.concept_gap,
        "chain rule",
        Urgency.fundamental,
        18,
        ["wrong", "wrong"],
        ["forgot the inside"],
    ),
    (
        0,
        "Calculus",
        "Differentiate y = e^(x³).",
        None,
        "e^(x³)",
        "3x²·e^(x³)",
        ErrorType.concept_gap,
        "chain rule",
        Urgency.fundamental,
        11,
        ["wrong", "wrong"],
        ["forgot the inside", "silly error"],
    ),
    (
        0,
        "Calculus",
        "d/dx of ln(5x² + 1)?",
        ["1/(5x²+1)", "10x/(5x²+1)", "5x/(5x²+1)", "10x"],
        "1/(5x²+1)",
        "10x/(5x²+1)",
        ErrorType.concept_gap,
        "chain rule",
        Urgency.fundamental,
        5,
        ["wrong"],
        ["forgot the inside"],
    ),
    # --- One single question missed repeatedly, different concept (limiting reagent).
    (
        4,
        "Chemistry",
        "2H₂ + O₂ → 2H₂O. With 4 mol H₂ and 3 mol O₂, how many mol H₂O?",
        ["4", "6", "3", "2"],
        "6",
        "4",
        ErrorType.misread_question,
        "stoichiometry",
        Urgency.very_important,
        30,
        ["wrong", "correct", "wrong"],
        ["ran out of time"],
    ),
    # --- The rest: varied subjects, mostly fine on review.
    (
        1,
        "Calculus",
        "∫ x·eˣ dx",
        None,
        "x·eˣ + C",
        "x·eˣ − eˣ + C",
        ErrorType.formula_error,
        "integration by parts",
        Urgency.very_important,
        40,
        ["correct", "correct", "correct"],
        [],
    ),
    (
        1,
        "Calculus",
        "∫ ln x dx",
        None,
        "1/x + C",
        "x·ln x − x + C",
        ErrorType.concept_gap,
        "integration by parts",
        Urgency.important,
        9,
        ["correct"],
        ["never seen this before"],
    ),
    (
        2,
        "Biology",
        "A cell in a hypertonic solution will…",
        ["swell", "shrink", "stay", "burst"],
        "swell",
        "shrink",
        ErrorType.misread_question,
        "osmosis",
        Urgency.very_important,
        55,
        ["correct", "correct", "correct", "correct"],
        ["by mistake"],
    ),
    (
        2,
        "Biology",
        "Water moves across a membrane toward the side with…",
        ["less solute", "more solute", "more water", "equal"],
        "less solute",
        "more solute",
        ErrorType.concept_gap,
        "osmosis",
        Urgency.fundamental,
        33,
        ["wrong", "correct", "correct"],
        [],
    ),
    (
        3,
        "Biology",
        "Which organelle produces most of the cell's ATP?",
        ["nucleus", "ribosome", "mitochondrion", "chloroplast"],
        "chloroplast",
        "mitochondrion",
        ErrorType.trap_answer,
        "cell organelles",
        Urgency.important,
        47,
        ["correct", "correct", "correct"],
        ["guessed"],
    ),
    (
        3,
        "Biology",
        "Aerobic respiration releases energy from glucose using…",
        ["CO₂", "O₂", "N₂", "H₂O"],
        "CO₂",
        "O₂",
        ErrorType.careless_arithmetic,
        "cell respiration",
        Urgency.important,
        14,
        ["correct", "correct"],
        ["silly error"],
    ),
    (
        4,
        "Chemistry",
        "N₂ + 3H₂ → 2NH₃. 2 mol N₂ and 3 mol H₂ gives how many mol NH₃?",
        ["4", "2", "6", "3"],
        "4",
        "2",
        ErrorType.concept_gap,
        "stoichiometry",
        Urgency.very_important,
        21,
        ["correct", "correct"],
        [],
    ),
    (
        5,
        "Chemistry",
        "Adding more reactant to a system at equilibrium shifts it…",
        ["left", "right", "nowhere", "depends"],
        "left",
        "right",
        ErrorType.concept_gap,
        "equilibrium",
        Urgency.important,
        60,
        ["correct", "correct", "correct", "correct"],
        [],
    ),
    (
        5,
        "Chemistry",
        "For an exothermic reaction, raising temperature shifts equilibrium…",
        ["right", "left", "nowhere", "depends"],
        "right",
        "left",
        ErrorType.misread_question,
        "equilibrium",
        Urgency.important,
        7,
        ["correct"],
        ["didn't read the question"],
    ),
    (
        6,
        "Spanish",
        "Mi hermana ___ médica. (ser/estar)",
        ["es", "está"],
        "está",
        "es",
        ErrorType.concept_gap,
        "ser vs estar",
        Urgency.very_important,
        36,
        ["correct", "correct", "correct"],
        [],
    ),
    (
        6,
        "Spanish",
        "Los niños ___ cansados. (ser/estar)",
        ["son", "están"],
        "son",
        "están",
        ErrorType.concept_gap,
        "ser vs estar",
        Urgency.very_important,
        3,
        [],
        ["knew it, blanked"],
    ),
    (
        7,
        "Spanish",
        "Cuando era niño, ___ al parque todos los días. (ir)",
        ["fui", "iba"],
        "fui",
        "iba",
        ErrorType.concept_gap,
        "preterite vs imperfect",
        Urgency.important,
        28,
        ["correct", "wrong", "correct"],
        [],
    ),
    (
        8,
        "History",
        "Which alliance did Germany belong to in 1914?",
        ["Triple Entente", "Triple Alliance", "League", "Axis"],
        "Triple Entente",
        "Triple Alliance",
        ErrorType.vocabulary_gap,
        "WWI causes",
        Urgency.important,
        66,
        ["correct", "correct", "correct", "correct"],
        ["need to memorise"],
    ),
    (
        8,
        "History",
        "The immediate trigger of WWI was…",
        ["Lusitania", "Sarajevo assassination", "Zimmermann", "Versailles"],
        "Lusitania",
        "Sarajevo assassination",
        ErrorType.time_pressure_guess,
        "WWI causes",
        Urgency.important,
        15,
        ["correct", "correct"],
        ["ran out of time"],
    ),
    (
        9,
        "Calculus",
        "Find the x-intercept of y = 2x − 6.",
        ["3", "−6", "6", "−3"],
        "−6",
        "3",
        ErrorType.misread_question,
        "linear equations",
        Urgency.important,
        2,
        [],
        ["didn't read the question"],
    ),
]


def analysis_text(q) -> dict:
    _, _, question, _, yours, correct, error_type, topic, _, _, _, _ = q
    return {
        "why_wrong": f"You put {yours!r}; the answer is {correct!r}. That is the "
        f"{error_type.value.replace('_', ' ')} pattern on {topic}.",
        "correct_reasoning": f"Work {topic} from the definition, then check against the stem.",
        "takeaway": f"On {topic}, slow down at the step that separates {yours!r} from {correct!r}.",
        "trap": f"{yours!r} is the answer you reach if you skip one step.",
    }


def play_ladder(mistake: Mistake, logged_at: datetime, script: list[str]) -> None:
    """Arm the ladder at `logged_at` and answer rungs as they came due, until today.

    A 'wrong' answer retires the rest of the cycle as superseded and arms a fresh
    ladder from that moment - exactly what the app does when you miss a review.
    """
    cycle = 0
    anchor = logged_at
    outcomes = list(script)
    while True:
        rungs = [
            ReviewEvent(
                id=new_id(),
                mistake_id=mistake.id,
                cycle=cycle,
                step_index=step,
                interval_label=label,
                due_at=anchor + offset,
            )
            for step, (label, offset) in enumerate(LADDER)
        ]
        mistake.reviews.extend(rungs)
        restarted_at: datetime | None = None
        for rung in rungs:
            if restarted_at is not None:
                rung.completed_at = restarted_at
                rung.outcome = ReviewOutcome.superseded
                continue
            if rung.due_at > NOW or not outcomes:
                break  # still open: this is what the review queue shows
            outcome = outcomes.pop(0)
            done_at = rung.due_at + timedelta(minutes=rng.randint(5, 240))
            if done_at > NOW:
                done_at = NOW - timedelta(minutes=1)
            rung.completed_at = done_at
            rung.outcome = ReviewOutcome(outcome)
            if outcome == "wrong":
                restarted_at = done_at
        if restarted_at is None:
            return
        cycle += 1
        anchor = restarted_at


async def main(reset: bool) -> None:
    await asyncio.to_thread(upgrade)
    async with get_sessionmaker()() as session:
        if reset:
            seeded = await session.scalars(
                select(Mistake).where(Mistake.user_id == USER, Mistake.source.like("Seed:%"))
            )
            for mistake in seeded:
                await session.delete(mistake)
            await session.execute(
                delete(Concept).where(Concept.user_id == USER, Concept.body.like("%[seed]"))
            )
            await session.commit()

        concepts: list[Concept] = []
        for title, subject, body in CONCEPTS:
            concept = Concept(
                id=new_id(), user_id=USER, title=title, subject=subject, body=f"{body} [seed]"
            )
            concept.mistakes = []
            concept.images = []
            session.add(concept)
            concepts.append(concept)

        for q in QUESTIONS:
            (
                ci,
                subject,
                question,
                choices,
                yours,
                correct,
                error_type,
                topic,
                urgency,
                days_ago,
                script,
                tags,
            ) = q
            logged_at = NOW - timedelta(days=days_ago, hours=rng.randint(0, 9))
            mistake = Mistake(
                id=new_id(),
                user_id=USER,
                created_at=logged_at,
                source=f"Seed: {subject} problem set",
                subject=subject,
                question_text=question,
                choices=choices,
                your_answer=yours,
                correct_answer=correct,
                student_note=None,
                analysis_status=AnalysisStatus.ready,
                analyzed_at=logged_at + timedelta(seconds=20),
                analyzed_by="seed",
                error_type=error_type,
                topic=topic,
                difficulty="medium",
                urgency=urgency,
                urgency_is_yours=False,
                tags=tags,
                **analysis_text(q),
            )
            mistake.images = []
            mistake.concepts = [concepts[ci]]
            play_ladder(mistake, logged_at, script)
            session.add(mistake)

        await session.commit()

        total = await session.scalar(select(Mistake.id).where(Mistake.user_id == USER).limit(1))
        rows = await session.scalars(
            select(Mistake)
            .where(Mistake.user_id == USER, Mistake.source.like("Seed:%"))
            .options(selectinload(Mistake.reviews), selectinload(Mistake.concepts))
        )
        print(f"Seeded {len(CONCEPTS)} concepts and {len(QUESTIONS)} questions.")
        for m in rows:
            wrong = sum(1 for r in m.reviews if r.outcome == ReviewOutcome.wrong)
            open_ = sum(1 for r in m.reviews if r.completed_at is None)
            print(
                f"  {m.subject:9} {m.topic:24} missed again on review ×{wrong}, {open_} rungs open"
            )
        assert total


if __name__ == "__main__":
    asyncio.run(main(reset="--reset" in sys.argv))
