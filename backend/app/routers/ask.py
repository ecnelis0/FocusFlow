"""The side panel's assistant: a question about the bank, answered from the bank."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..analysis import get_analyzer
from ..config import get_settings
from ..deps import SessionDep, UserDep
from ..query import BankQuery, bank_context, describe, digest, run_query, vocabulary
from ..readiness import analyzer_ready
from ..schemas import MistakeRead

router = APIRouter(prefix="/ask", tags=["ask"])


class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


class Answer(BaseModel):
    question: str
    answer: str
    # Which analyzer answered, and whether it is the real one. The offline stub
    # returning the whole bank looks identical to a working search that matched
    # everything; this is how the UI can tell the student which they are seeing.
    analyzer: str
    analyzer_ready: bool
    # What was actually searched, so the student can see the assistant's reading of
    # their sentence rather than having to trust it.
    filter_description: str
    query: BankQuery
    mistakes: list[MistakeRead]
    error: str | None = None


@router.post("", response_model=Answer)
async def ask(body: Ask, session: SessionDep, user_id: UserDep) -> Answer:
    """Answer a question about the bank.

    Three steps, in this order for a reason: the model turns the sentence into a
    filter, the database runs it, and only then does the model get to speak - about
    rows that exist. It never answers from a recollection of the bank.
    """
    # One definition of "ready", shared with /health: the agent provider has no key,
    # it has a login. Answering with the panel telling them the key is missing was
    # wrong twice over.
    settings = get_settings()
    provider = settings.ai_provider.lower()
    ready = analyzer_ready(settings)

    analyzer = get_analyzer()
    today = datetime.now(UTC).date()
    # What this bank actually contains, so the model filters on strings that exist.
    words = await vocabulary(session, user_id)

    try:
        query = await analyzer.interpret(body.question, today, words)
    except Exception as exc:  # a failed interpretation still gets them results
        query = BankQuery()
        mistakes = await run_query(session, user_id, query)
        return Answer(
            question=body.question,
            answer="I could not read that as a search, so here is the whole bank.",
            analyzer=provider,
            analyzer_ready=ready,
            filter_description=describe(query),
            query=query,
            mistakes=mistakes,
            error=f"{type(exc).__name__}: {exc}"[:500],
        )

    mistakes = await run_query(session, user_id, query)

    # The whole bank goes along as background, so the answer can reach beyond the
    # rows the filter matched - concepts, notes, review history, the lot.
    context = await bank_context(session, user_id)
    try:
        answer = await analyzer.summarise(body.question, digest(mistakes), context)
        error = None
    except Exception as exc:
        # The rows are the valuable part; losing the prose is survivable.
        answer = f"{len(mistakes)} question(s) matched."
        error = f"{type(exc).__name__}: {exc}"[:500]

    return Answer(
        question=body.question,
        answer=answer,
        analyzer=provider,
        analyzer_ready=ready,
        filter_description=describe(query),
        query=query,
        mistakes=mistakes,
        error=error,
    )


class Turn(BaseModel):
    """One thing said, by one side."""

    role: Literal["student", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Chat(BaseModel):
    """The conversation so far. The last turn is the one being answered.

    The whole transcript comes up from the client rather than being kept on the
    server: there is no session here, one student, and a conversation that
    survives a restart of the API is a database table nobody asked for. The cost
    is that a long conversation is re-sent each time, which for text this size is
    nothing next to the model call it is about to make.
    """

    messages: list[Turn] = Field(min_length=1, max_length=40)


class Reply(BaseModel):
    answer: str
    analyzer: str
    analyzer_ready: bool
    filter_description: str
    query: BankQuery
    mistakes: list[MistakeRead]
    error: str | None = None


def transcript(messages: list[Turn]) -> str:
    """The conversation as the model should read it.

    Everything before the last turn is context; the last turn is the question.
    Labelled rather than merged, because "what about the other one?" only means
    anything if the model can see which two things were being discussed.
    """
    history = messages[:-1][-8:]
    lines = [
        f"{'Student' if turn.role == 'student' else 'You'}: {turn.content}" for turn in history
    ]
    latest = messages[-1].content
    if not lines:
        return latest
    return (
        "The conversation so far:\n"
        + "\n".join(lines)
        + "\n\nThe student's latest message, which is what you are answering:\n"
        + latest
    )


@router.post("/chat", response_model=Reply)
async def chat(body: Chat, session: SessionDep, user_id: UserDep) -> Reply:
    """Carry on a conversation about the bank.

    The same three steps as `/ask` — read the sentence into a filter, run it,
    then let the model speak about rows that exist — with the difference that
    both model calls see what was said earlier. A follow-up is the normal way
    people ask a second question ("and in Biology?", "which of those is oldest?")
    and answering it as though it were the first one is what makes an assistant
    feel like a search box with a personality.
    """
    settings = get_settings()
    provider = settings.ai_provider.lower()
    ready = analyzer_ready(settings)

    analyzer = get_analyzer()
    today = datetime.now(UTC).date()
    words = await vocabulary(session, user_id)
    asked = transcript(body.messages)

    try:
        query = await analyzer.interpret(asked, today, words)
    except Exception as exc:
        # A failed reading still gets them rows: the bank is the valuable part,
        # and a filter that could not be built is not a reason to answer nothing.
        query = BankQuery()
        mistakes = await run_query(session, user_id, query)
        return Reply(
            answer="I could not read that as a search, so here is the whole bank.",
            analyzer=provider,
            analyzer_ready=ready,
            filter_description=describe(query),
            query=query,
            mistakes=mistakes,
            error=f"{type(exc).__name__}: {exc}"[:500],
        )

    mistakes = await run_query(session, user_id, query)
    context = await bank_context(session, user_id)

    try:
        answer = await analyzer.summarise(asked, digest(mistakes), context)
        error = None
    except Exception as exc:
        answer = f"{len(mistakes)} question(s) matched."
        error = f"{type(exc).__name__}: {exc}"[:500]

    return Reply(
        answer=answer,
        analyzer=provider,
        analyzer_ready=ready,
        filter_description=describe(query),
        query=query,
        mistakes=mistakes,
        error=error,
    )
