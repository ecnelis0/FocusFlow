"""Offline analyzer.

Runs with no API key so the whole loop - log, analyse, bank, review - works before
a provider is picked, and so tests never touch the network. Its text is obviously
canned; it is not meant to teach anyone anything.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from ..query import BankQuery, Vocabulary

# One keyword -> topic map for every subject. It is a stand-in, not a taxonomy: the
# point is that the offline analyzer files a question somewhere plausible.
_TOPIC_HINTS = {
    "equation": "linear equations",
    "triangle": "geometry",
    "circle": "circles",
    "probability": "probability",
    "percent": "percentages",
    "function": "functions",
    "derivative": "differentiation",
    "integral": "integration",
    "cell": "cell biology",
    "photosynthesis": "photosynthesis",
    "mole": "stoichiometry",
    "force": "forces and motion",
    "author": "author's purpose",
    "evidence": "supporting evidence",
    "comma": "punctuation",
    "verb": "verb forms",
    "treaty": "treaties and diplomacy",
}
_FALLBACK_TOPIC = "general"


def _guess_topic(text: str) -> str:
    lowered = text.lower()
    for needle, topic in _TOPIC_HINTS.items():
        if needle in lowered:
            return topic
    return _FALLBACK_TOPIC


class StubAnalyzer:
    name = "stub"

    async def interpret(self, question: str, today: date, vocabulary: Vocabulary) -> BankQuery:
        return _interpret(question, today, vocabulary)

    async def summarise(self, question: str, digest: str, context: str = "") -> str:
        """Reports the counts it was given. It does not attempt to answer.

        When the question is about repetition, the repetition block is the part
        worth showing - which is also what a real provider is asked to lead with.
        """
        lines = digest.splitlines()
        rows_at = lines.index("Rows:") if "Rows:" in lines else len(lines)
        head = [line for line in lines[:rows_at] if line.strip()]

        asked_about_repetition = any(
            word in question.lower()
            for word in ("consistent", "always", "keep", "again", "repeat", "recurring")
        )
        if asked_about_repetition:
            # Breadth lines too - several different questions in one area is the
            # commoner pattern, and the one the student's own example described.
            # "Worst offenders" because the question was "which questions": a tally
            # alone leaves them still looking.
            repeats = [
                line
                for line in head
                if "repeat miss" in line
                or "missed again" in line
                or "different questions" in line
                or line.startswith("Worst offenders")
                or "accounts for more than one question" in line
            ]
            if repeats:
                return "\n".join([head[0], *repeats])
        return "\n".join(head)


# --- Asking the bank, offline -------------------------------------------------
#
# Keyword matching, not understanding. It covers the phrasings the app's own copy
# uses so the assistant is demonstrable without a key; anything subtler needs a
# real provider.

_UNITS = {
    "day": 1,
    "week": 7,
    "month": 30,
    "year": 365,
}

_NUMBER_WORDS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "nine": 9,
    "twelve": 12,
}


# Words too common to be evidence that the student meant a particular topic.
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "for",
    "from",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "questions",
    "show",
    "that",
    "the",
    "to",
    "what",
    "which",
    "with",
}


def _mentions(text: str, phrase: str) -> bool:
    """Does the question refer to this topic or concept?

    Whole phrase, or every meaningful word of it - so "circles" matches "circles"
    and "supporting evidence" matches "evidence supporting", but a concept titled
    "Read the question" is not dragged in by the word "the".
    """
    phrase = phrase.lower().strip()
    if not phrase:
        return False
    if phrase in text:
        return True
    words = [word for word in re.findall(r"[a-z]+", phrase) if word not in _STOPWORDS]
    return bool(words) and all(word in text for word in words)


def _since(text: str, today: date) -> date | None:
    """'in the past 3 months' / 'last two weeks' -> an absolute date."""
    # The count is optional: "the past year" means one of them.
    match = re.search(r"(?:past|last|previous|within)\s+(?:(\w+)\s+)?(day|week|month|year)s?", text)
    if not match:
        return None
    raw, unit = match.groups()
    count = 1 if raw is None else (int(raw) if raw.isdigit() else _NUMBER_WORDS.get(raw))
    return None if count is None else today - timedelta(days=count * _UNITS[unit])


def _interpret(question: str, today: date, vocabulary: Vocabulary) -> BankQuery:
    text = question.lower()

    # Match against what the bank actually holds rather than a hardcoded list: the
    # student's own subjects, topics and concept titles are the words they will use.
    subjects = [subject for subject in vocabulary.subjects if _mentions(text, subject)]
    topics = [topic for topic in vocabulary.topics if _mentions(text, topic)]
    concepts = [title for title in vocabulary.concepts if _mentions(text, title)]

    return BankQuery(
        subjects=subjects,
        topics=topics,
        concepts=concepts,
        logged_after=_since(text, today),
    )
