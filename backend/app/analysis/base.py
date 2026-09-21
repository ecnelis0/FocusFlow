"""The analyzer contract.

Two jobs remain: turning a question about the bank into a filter (`interpret`),
and answering from the rows that filter matched (`summarise`). Reading material
into concepts is the other half, and lives in `extract.py`.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from ..query import BankQuery


class AnalysisFailed(RuntimeError):
    """The analyzer could not answer. Raised by the extractor too."""


class Analyzer(Protocol):
    name: str

    async def interpret(self, question: str, today: date) -> BankQuery:
        """Turn a question about the bank into a filter the database can run.

        `today` is passed in rather than read from the clock so "the past 3 months"
        resolves to real dates the model can write down.
        """
        ...

    async def summarise(self, question: str, digest: str, context: str = "") -> str:
        """Answer from the matched rows, with the whole bank as background.

        `digest` is what the filter matched and is what the answer is about;
        `context` is everything else - every concept and every question - so
        "how does this compare" and "what else is under that concept" can be
        answered without a second search.
        """
        ...
