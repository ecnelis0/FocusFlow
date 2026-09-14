"""Claude Agent SDK provider: runs on your Claude plan login, no API key.

`AI_PROVIDER=agent`. The Agent SDK drives the Claude Code CLI as a subprocess, and
the CLI uses whatever `claude auth login` stored - so a claude.ai subscription pays
for the calls. Nothing else changes: the same prompts and the same structured
output schemas as the API adapter in `claude.py`, so the two providers are
interchangeable and the tests for one cover the request shape of the other.

Pictures and PDFs are not sent inline. They are written to a temporary directory
and the agent is told to `Read` them, which is what the CLI's Read tool is for -
it handles images and PDFs natively. Everything else runs with no tools at all.
"""

from __future__ import annotations

import io
import tempfile
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from PIL import Image
from pydantic import BaseModel, ValidationError

from ..query import BankQuery, Vocabulary
from .base import AnalysisFailed, MistakeAnalysis, MistakeInput
from .claude import INTERPRET_PROMPT, SUMMARISE_PROMPT, SYSTEM_PROMPT, _render, summarise_prompt
from .extract import _TEXT_LABELS, EXTRACT_PROMPT, CaptureExtraction, CaptureInput, _existing_block

# Where a PDF or image lands before the agent reads it. Extension matters: the CLI
# decides how to read a file from its suffix.
_SUFFIX = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


# Longest side of a picture handed to the agent. A phone photo is 4000px and 5MB;
# handwriting is still legible at this size and the read comes back in seconds.
MAX_EDGE = 1800


def _shrink(data: bytes, suffix: str) -> tuple[bytes, str]:
    """Downscale a large photo and re-encode it as JPEG. Small pictures pass through."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            if max(image.size) <= MAX_EDGE and len(data) <= 1_500_000:
                return data, suffix
            image.thumbnail((MAX_EDGE, MAX_EDGE))
            out = io.BytesIO()
            image.convert("RGB").save(out, format="JPEG", quality=85)
            return out.getvalue(), ".jpg"
    except OSError:
        return data, suffix


async def _run(
    *,
    prompt: str,
    system: str,
    model: str,
    schema: type[BaseModel] | None,
    cwd: str | None = None,
    allowed_tools: list[str] | None = None,
    # Structured output arrives through an internal tool turn, so even a no-tool
    # call needs more than one: max_turns=1 fails intermittently with "Reached
    # maximum number of turns (1)".
    max_turns: int = 8,
) -> Any:
    """One agent turn. Returns the validated structured output, or the text."""
    try:
        from claude_agent_sdk import (
            AssistantMessage,
            ClaudeAgentOptions,
            ClaudeSDKError,
            ResultMessage,
            TextBlock,
            query,
        )
    except ImportError as exc:
        raise AnalysisFailed(
            "claude-agent-sdk is not installed: run `uv sync` in backend/"
        ) from exc

    options = ClaudeAgentOptions(
        model=model,
        system_prompt=system,
        allowed_tools=allowed_tools or [],
        # Only ever the Read tool, on a directory this process created. Nothing to
        # approve, and a permission prompt would hang a headless subprocess.
        permission_mode="bypassPermissions" if allowed_tools else "default",
        max_turns=max_turns,
        cwd=cwd,
        # A Read of a picture streams the image back as base64 inside one JSON line.
        # The SDK's default 1MB line buffer rejects anything bigger than a small
        # screenshot with CLIJSONDecodeError.
        max_buffer_size=64 * 1024 * 1024,
        **(
            {"output_format": {"type": "json_schema", "schema": schema.model_json_schema()}}
            if schema
            else {}
        ),
    )

    text: list[str] = []
    result: ResultMessage | None = None
    try:
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                text.extend(b.text for b in message.content if isinstance(b, TextBlock))
            elif isinstance(message, ResultMessage):
                result = message
    except ClaudeSDKError as exc:  # CLI missing, not logged in, process died
        raise AnalysisFailed(f"{type(exc).__name__}: {exc}") from exc

    if result is None:
        raise AnalysisFailed("the agent returned no result")
    if result.is_error:
        detail = "; ".join(result.errors or []) or result.result or result.subtype
        raise AnalysisFailed(f"agent error: {detail}")
    if result.stop_reason == "refusal":
        raise AnalysisFailed("model declined to answer")

    if schema is None:
        return "".join(text).strip() or (result.result or "")
    if result.structured_output is None:
        raise AnalysisFailed("model returned no structured output")
    try:
        return schema.model_validate(result.structured_output)
    except ValidationError as exc:
        raise AnalysisFailed(f"structured output did not validate: {exc}") from exc


class AgentAnalyzer:
    name = "agent"

    def __init__(self, model: str) -> None:
        self._model = model

    async def analyze(self, mistake: MistakeInput) -> MistakeAnalysis:
        return await _run(
            prompt=_render(mistake), system=SYSTEM_PROMPT, model=self._model, schema=MistakeAnalysis
        )

    async def interpret(self, question: str, today: date, vocabulary: Vocabulary) -> BankQuery:
        prompt = (
            f"Today is {today.isoformat()}.\n\n{vocabulary.render()}\n\n"
            f"The student asked: {question}"
        )
        try:
            return await _run(
                prompt=prompt, system=INTERPRET_PROMPT, model=self._model, schema=BankQuery
            )
        except AnalysisFailed as exc:
            raise AnalysisFailed(f"the model would not read that as a search ({exc})") from exc

    async def summarise(self, question: str, digest: str, context: str = "") -> str:
        return await _run(
            prompt=summarise_prompt(question, digest, context),
            system=SUMMARISE_PROMPT,
            model=self._model,
            schema=None,
        )


class AgentExtractor:
    name = "agent"

    def __init__(self, model: str, mkdtemp: Callable[[], str] = tempfile.mkdtemp) -> None:
        self._model = model
        self._mkdtemp = mkdtemp

    async def extract(self, capture: CaptureInput) -> CaptureExtraction:
        instructions = [_existing_block(capture)]
        if capture.subject_hint:
            instructions.append(f"The student says these notes are about: {capture.subject_hint}")
        instructions.append("Extract the concepts.")
        tail = "\n\n".join(instructions)

        if capture.kind in ("image", "pdf"):
            if capture.data is None or capture.media_type is None:
                raise AnalysisFailed(f"a {capture.kind} capture needs bytes")
            suffix = _SUFFIX.get(capture.media_type)
            if suffix is None:
                raise AnalysisFailed(f"cannot hand a {capture.media_type} to the agent")
            directory = self._mkdtemp()
            data = capture.data
            if capture.kind == "image":
                data, suffix = _shrink(data, suffix)
            path = Path(directory) / f"notes{suffix}"
            path.write_bytes(data)
            try:
                return await _run(
                    prompt=(
                        f"The student's notes are the file at {path}. Read it with the Read "
                        "tool - every page, in order, using the pages parameter in batches if "
                        "it is a long PDF - then extract every concept it contains and every "
                        "practice question it poses, saying which page each came from."
                        f"\n\n{tail}"
                    ),
                    system=EXTRACT_PROMPT,
                    model=self._model,
                    schema=CaptureExtraction,
                    cwd=directory,
                    allowed_tools=["Read"],
                    max_turns=40,
                )
            finally:
                path.unlink(missing_ok=True)
                Path(directory).rmdir()

        label = _TEXT_LABELS.get(capture.kind, "The notes")
        return await _run(
            prompt=f"{label}:\n{capture.text or ''}\n\n{tail}",
            system=EXTRACT_PROMPT,
            model=self._model,
            schema=CaptureExtraction,
        )
