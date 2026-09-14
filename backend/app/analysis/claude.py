"""Anthropic-backed analyzer.

Uses structured outputs (`messages.parse`) so the response is a validated
`MistakeAnalysis` rather than prose we would have to scrape.
"""

from __future__ import annotations

from datetime import date

import anthropic
import httpx2

from ..query import BankQuery, Vocabulary
from .base import AnalysisFailed, MistakeAnalysis, MistakeInput

SYSTEM_PROMPT = """\
You are a tutor reviewing a question a student got wrong, so it can be filed in their \
mistake bank. The subject can be anything - a science, a language, a history course - \
and is given when the student named one.

Diagnose the student, not the question. The interesting thing is what their specific \
wrong answer reveals about how they were thinking - a sign error, a misread stem, a \
missing rule, a trap they walked into. Address them as "you". Be concrete and short; \
this text is read again a month later, on a phone, under time pressure.

Pick the single error_type that best explains this particular miss. If the student left \
a note about what happened, weight it heavily - they were there and you were not.\
"""


INTERPRET_PROMPT = """\
You turn a student's question about their mistake bank into a database filter.

Return only the filter. You are not answering the question - something else runs the \
filter and reports the rows. Leave a field empty when the student did not constrain it; \
an over-tight filter silently hides their own work from them.

Resolve every relative date against today's date, given below, and write absolute dates.

Subjects are free text the student typed, not a fixed list. You are given the subjects, \
topics and concepts this bank actually contains. When the student names something, \
match it to those - copy the exact strings, including a subject's spelling and \
capitalisation. Do not invent a subject, a topic or a concept title; a filter on a \
string that is not in the bank silently returns nothing, which reads to the student as \
"you have no such questions".

If the student is asking about the bank as a whole ("what am I worst at", "what should I \
review first") rather than for a subset, return an empty filter and let them see \
everything - the counts are computed separately and you will get them.

"What have I consistently been getting wrong in the past month" is a date range and \
nothing else: set logged_after and leave every other field empty. Narrowing it to one \
topic would hide the very pattern they are asking you to find.\
"""

SUMMARISE_PROMPT = """\
You are answering a student's question about their own mistake bank.

You are given two things: the rows that matched their question, and the whole bank as \
background - every concept with the student's own notes on it, every question with its \
tags, concepts, takeaway and review record, and the totals. Answer about the matched \
rows, and draw on the rest of the bank whenever it makes the answer more useful: what \
else sits under the same concept, what the student wrote about it, how this compares \
to the rest. Never invent a question or a count that is not in what you were given. If \
nothing matched, say so plainly, and say what the bank does contain instead.

When they ask what they *keep* getting wrong - "consistently", "always", "again and \
again", "over the past month" - two things count, and you are given both:

* several *different* questions missed in the same topic, concept or for the same \
  reason. Four different inverse trig questions, each wrong once, is a weakness in \
  inverse trig even though no single one has come back.
* the same question still wrong when it came round again.

Lead with whichever is stronger, name the topic, concept or reason, and give the number. \
A single question wrong once is not a pattern; do not invent one.

Two or three sentences. Lead with the count, then the pattern worth noticing - the slot \
or topic that keeps recurring, not a restatement of the list they can already see.\
"""


def summarise_prompt(question: str, digest: str, context: str) -> str:
    """The whole bank first (stable, cacheable), the matched rows and question last."""
    parts = []
    if context:
        parts.append(f"The whole bank, for background:\n{context}")
    parts.append(f"Rows that matched the question:\n{digest}")
    parts.append(f"The student asked: {question}")
    return "\n\n".join(parts)


def _render(mistake: MistakeInput) -> str:
    parts = [f"Subject: {mistake.subject}"] if mistake.subject else []
    if mistake.source:
        parts.append(f"Source: {mistake.source}")
    parts.append(f"\nQuestion:\n{mistake.question_text}")
    if mistake.choices:
        rendered = "\n".join(f"{chr(65 + i)}. {choice}" for i, choice in enumerate(mistake.choices))
        parts.append(f"\nChoices:\n{rendered}")
    parts.append(f"\nThe student answered: {mistake.your_answer}")
    parts.append(f"The correct answer is: {mistake.correct_answer}")
    if mistake.student_note:
        parts.append(f"\nThe student's own note: {mistake.student_note}")
    return "\n".join(parts)


class ClaudeAnalyzer:
    name = "claude"

    def __init__(
        self,
        api_key: str | None,
        model: str,
        http_client: httpx2.AsyncClient | None = None,
        base_url: str | None = None,
    ) -> None:
        # `http_client` and `base_url` exist for the test that drives this class
        # against a stand-in Anthropic endpoint. In the app both are None and the
        # SDK talks to Anthropic, reading ANTHROPIC_BASE_URL from the environment
        # if it is set.
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key,
            **({"http_client": http_client} if http_client else {}),
            **({"base_url": base_url} if base_url else {}),
        )
        self._model = model

    async def analyze(self, mistake: MistakeInput) -> MistakeAnalysis:
        try:
            response = await self._client.messages.parse(
                model=self._model,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": _render(mistake)}],
                output_format=MistakeAnalysis,
            )
        except anthropic.APIError as exc:  # network, rate limit, bad key, 5xx
            raise AnalysisFailed(f"{type(exc).__name__}: {exc}") from exc

        if response.stop_reason == "refusal":
            detail = getattr(response.stop_details, "explanation", None) or "no explanation"
            raise AnalysisFailed(f"model declined to answer ({detail})")

        parsed = response.parsed_output
        if parsed is None:
            raise AnalysisFailed("model returned no structured output")
        return parsed

    async def interpret(self, question: str, today: date, vocabulary: Vocabulary) -> BankQuery:
        try:
            response = await self._client.messages.parse(
                model=self._model,
                max_tokens=4096,
                system=INTERPRET_PROMPT,
                thinking={"type": "adaptive"},
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Today is {today.isoformat()}.\n\n"
                            f"{vocabulary.render()}\n\n"
                            f"The student asked: {question}"
                        ),
                    }
                ],
                output_format=BankQuery,
            )
        except anthropic.APIError as exc:
            raise AnalysisFailed(f"{type(exc).__name__}: {exc}") from exc

        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise AnalysisFailed("the model would not read that as a search")
        return response.parsed_output

    async def summarise(self, question: str, digest: str, context: str = "") -> str:
        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=2048,
                system=SUMMARISE_PROMPT,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": summarise_prompt(question, digest, context)}],
            )
        except anthropic.APIError as exc:
            raise AnalysisFailed(f"{type(exc).__name__}: {exc}") from exc

        if response.stop_reason == "refusal":
            raise AnalysisFailed("the model declined to answer")
        return "".join(block.text for block in response.content if block.type == "text")
